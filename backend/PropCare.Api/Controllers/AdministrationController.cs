using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace PropCare.Api.Controllers;

[ApiController, Authorize, Route("api")]
public class AdministrationController(PropCareDb db) : ControllerBase
{
    private UserAccount Account => (UserAccount)HttpContext.Items["account"]!;
    private IQueryable<Property> Properties => Account.Role switch {
        "admin" => db.Properties,
        "manager" => db.Properties.Where(x => x.ManagerId == Account.Id),
        "tenant" => db.Properties.Where(x => db.Units.Any(u => u.UserId == Account.Id && u.PropertyId == x.Id && u.Active)),
        _ => db.Properties.Where(x => db.Requests.Any(r => r.PropertyId == x.Id && r.Technician != null && r.Technician.UserId == Account.Id))
    };
    [HttpGet("users"), Authorize(Roles = "admin")]
    public async Task<object> Users() => new { data = (await db.Users.OrderBy(x => x.Name).ToListAsync()).Select(AuthService.PublicUser) };
    [HttpPost("users"), Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateUser(UserInput input)
    {
        if (string.IsNullOrEmpty(input.Password)) throw new ApiException(400,"A temporary password is required.");
        AuthService.ValidatePassword(input.Password);
        ValidateRole(input.Role);
        var u = new UserAccount { Name = input.Name.Trim(), Email = AuthService.Normalize(input.Email), Role = input.Role, Active = input.Active, PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password,12) };
        db.Users.Add(u);
        if (u.Role == "technician") db.Technicians.Add(new Technician { UserId = u.Id });
        await db.SaveChangesAsync();
        return StatusCode(201,new { data = AuthService.PublicUser(u) });
    }
    [HttpPut("users/{id}"), Authorize(Roles = "admin")]
    public async Task<object> UpdateUser(string id, UserInput input)
    {
        var u = await db.Users.FindAsync(id) ?? throw new ApiException(404,"User not found.");
        ValidateRole(input.Role);
        if (u.Id == Account.Id && (!input.Active || input.Role != "admin")) throw new ApiException(400,"You cannot disable or demote your own account.");
        if (u.Role != input.Role) {
            if (await db.Properties.AnyAsync(x => x.ManagerId == id && x.Active) || await db.Units.AnyAsync(x => x.UserId == id && x.Active) ||
                await db.Requests.AnyAsync(x => Domain.OpenStatuses.Contains(x.Status) && (x.TenantId == id || (x.Technician != null && x.Technician.UserId == id))))
                throw new ApiException(409,"Reassign active properties, units and open work before changing this role.");
        }
        u.Name = input.Name.Trim(); u.Email = AuthService.Normalize(input.Email); u.Role = input.Role; u.Active = input.Active;
        if (!string.IsNullOrEmpty(input.Password)) { AuthService.ValidatePassword(input.Password); u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password,12); u.FailedLogins = 0; u.LockedUntil = null; }
        if (u.Role == "technician" && !await db.Technicians.AnyAsync(x => x.UserId == id)) db.Technicians.Add(new Technician { UserId = id });
        if (!u.Active || !string.IsNullOrEmpty(input.Password)) {
            foreach (var session in await db.Sessions.Where(x => x.UserId == id && !x.Revoked).ToListAsync()) session.Revoked = true;
        }
        await db.SaveChangesAsync(); return new { data = AuthService.PublicUser(u) };
    }
    [HttpPut("profile")]
    public async Task<object> Profile(ProfileInput input)
    {
        var u = Account;
        if (!string.IsNullOrEmpty(input.Password) || AuthService.Normalize(input.Email) != u.Email) {
            if (string.IsNullOrEmpty(input.CurrentPassword) || System.Text.Encoding.UTF8.GetByteCount(input.CurrentPassword) > 72 || !BCrypt.Net.BCrypt.Verify(input.CurrentPassword,u.PasswordHash)) throw new ApiException(400,"Enter your current password to change email or password.");
        }
        u.Name = input.Name.Trim(); u.Email = AuthService.Normalize(input.Email);
        if (!string.IsNullOrEmpty(input.Password)) {
            AuthService.ValidatePassword(input.Password); u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password,12);
            foreach (var session in await db.Sessions.Where(x => x.UserId == u.Id && !x.Revoked).ToListAsync()) session.Revoked = true;
        }
        await db.SaveChangesAsync(); return new { data = AuthService.PublicUser(u), signInAgain = !string.IsNullOrEmpty(input.Password) };
    }
    [HttpGet("properties")]
    public async Task<object> ListProperties() => new { data = await Properties.OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Address, x.Area, x.ManagerId, managerName = x.Manager.Name, x.Active }).ToListAsync() };
    [HttpPost("properties"), Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateProperty(PropertyInput input)
    {
        await CheckManager(input.ManagerId);
        var p = new Property { Name = input.Name.Trim(), Address = input.Address.Trim(), Area = input.Area.Trim(), ManagerId = input.ManagerId, Active = input.Active };
        db.Properties.Add(p); await db.SaveChangesAsync(); return StatusCode(201,new { data = new { p.Id } });
    }
    [HttpPut("properties/{id}"), Authorize(Roles = "admin")]
    public async Task<object> UpdateProperty(string id,PropertyInput input)
    {
        var p = await db.Properties.FindAsync(id) ?? throw new ApiException(404,"Property not found.");
        await CheckManager(input.ManagerId);
        if (!input.Active && await db.Requests.AnyAsync(x => x.PropertyId == id && Domain.OpenStatuses.Contains(x.Status))) throw new ApiException(409,"Complete open work before archiving the property.");
        p.Name = input.Name.Trim(); p.Address = input.Address.Trim(); p.Area = input.Area.Trim(); p.ManagerId = input.ManagerId; p.Active = input.Active;
        await db.SaveChangesAsync(); return new { message = "Property saved." };
    }
    [HttpGet("units")]
    public async Task<object> Units()
    {
        var units = db.Units.AsQueryable();
        if (Account.Role == "tenant") units = units.Where(x => x.UserId == Account.Id && x.Active && x.Property.Active);
        else if (Account.Role == "manager") units = units.Where(x => x.Property.ManagerId == Account.Id);
        else if (Account.Role != "admin") throw new ApiException(403,"Access denied.");
        return new { data = await units.OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.UserId, tenantName = x.User.Name, x.PropertyId, propertyName = x.Property.Name, x.Active }).ToListAsync() };
    }
    [HttpPost("units"), Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateUnit(UnitInput input)
    {
        await CheckUnit(input);
        var unit = new TenantUnit { UserId = input.UserId, PropertyId = input.PropertyId, Name = input.Name.Trim(), Active = input.Active };
        db.Units.Add(unit); await db.SaveChangesAsync(); return StatusCode(201,new { data = new { unit.Id } });
    }
    [HttpPut("units/{id:int}"), Authorize(Roles = "admin")]
    public async Task<object> UpdateUnit(int id,UnitInput input)
    {
        var unit = await db.Units.FindAsync(id) ?? throw new ApiException(404,"Unit link not found.");
        if (input.UserId != unit.UserId || input.PropertyId != unit.PropertyId)
            throw new ApiException(409,"Archive this link and create a new tenancy to change its tenant or property.");
        if (input.Active || input.UserId != unit.UserId || input.PropertyId != unit.PropertyId) await CheckUnit(input);
        // Historical requests retain their original tenancy and unit. End the link and create a new one for a new occupant.
        if ((input.UserId != unit.UserId || input.PropertyId != unit.PropertyId || input.Name.Trim() != unit.Name) && await db.Requests.AnyAsync(x => x.UnitId == id))
            throw new ApiException(409,"This tenancy has history. Archive the link and add a new tenancy instead.");
        unit.UserId = input.UserId; unit.PropertyId = input.PropertyId; unit.Name = input.Name.Trim(); unit.Active = input.Active;
        await db.SaveChangesAsync(); return new { message = "Tenant link saved." };
    }
    [HttpGet("tenants"), Authorize(Roles = "admin,manager")]
    public async Task<object> Tenants()
    {
        var users = db.Users.Where(x => x.Role == "tenant");
        if (Account.Role == "manager") users = users.Where(x => db.Units.Any(u => u.UserId == x.Id && u.Active && u.Property.ManagerId == Account.Id));
        return new { data = (await users.OrderBy(x => x.Name).ToListAsync()).Select(AuthService.PublicUser) };
    }
    [HttpGet("categories")]
    public async Task<object> Categories() => new { data = await db.Categories.Where(x => Account.Role == "admin" || x.Active).OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Active }).ToListAsync() };
    [HttpPost("categories"), Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateCategory(CategoryInput input)
    {
        var c = new Category { Name = input.Name.Trim(), Active = input.Active }; db.Categories.Add(c); await db.SaveChangesAsync(); return StatusCode(201,new { data = c });
    }
    [HttpPut("categories/{id}"), Authorize(Roles = "admin")]
    public async Task<object> UpdateCategory(string id,CategoryInput input)
    {
        var c = await db.Categories.FindAsync(id) ?? throw new ApiException(404,"Category not found.");
        c.Name = input.Name.Trim(); c.Active = input.Active; await db.SaveChangesAsync(); return new { data = c };
    }
    [HttpGet("technicians"), Authorize(Roles = "admin,manager")]
    public async Task<object> Technicians() => new { data = await db.Technicians.Where(x => x.User.Role == "technician").OrderBy(x => x.User.Name)
        .Select(x => new { x.Id, x.UserId, name = x.User.Name, email = x.User.Email, active = x.User.Active, x.Skill,
            openJobs = db.Requests.Count(r => r.TechnicianId == x.Id && Domain.OpenStatuses.Contains(r.Status)),
            averageRating = db.Ratings.Where(r => r.Request.TechnicianId == x.Id).Select(r => (double?)r.Stars).Average() }).ToListAsync() };
    [HttpPut("technicians/{id}"), Authorize(Roles = "admin")]
    public async Task<object> UpdateTechnician(string id,TechnicianInput input)
    {
        var t = await db.Technicians.FindAsync(id) ?? throw new ApiException(404,"Technician not found.");
        if (t.UserId != input.UserId) throw new ApiException(400,"A technician record cannot be transferred to another account.");
        t.Skill = input.Skill.Trim(); await db.SaveChangesAsync(); return new { message = "Technician saved." };
    }
    [HttpGet("settings")]
    public async Task<object> Settings() => new { data = await db.Settings.Select(x => new { x.OrgName }).FirstOrDefaultAsync() ?? new { OrgName = "Obs Realty Group" } };
    [HttpPut("settings"), Authorize(Roles = "admin")]
    public async Task<object> SaveSettings(SettingsInput input)
    {
        var s = await db.Settings.FindAsync(1);
        if (s == null) { s = new WorkspaceSetting(); db.Settings.Add(s); }
        s.OrgName = input.OrgName.Trim(); await db.SaveChangesAsync(); return new { message = "Settings saved." };
    }
    [HttpGet("notifications")]
    public async Task<object> Notifications() => new { data = await db.Notifications.Where(x => x.UserId == Account.Id).OrderByDescending(x => x.CreatedAt).Take(100).Select(x => new { x.Id, x.RequestId, x.Title, x.Read, x.CreatedAt }).ToListAsync() };
    [HttpPost("notifications/read")]
    public async Task<object> ReadNotifications() { await db.Notifications.Where(x => x.UserId == Account.Id && !x.Read).ExecuteUpdateAsync(x => x.SetProperty(n => n.Read,true)); return new { message = "Notifications marked as read." }; }
    private static void ValidateRole(string role) { if (!Domain.Roles.Contains(role)) throw new ApiException(400,"Choose a valid role."); }
    private async Task CheckManager(string id) { if (!await db.Users.AnyAsync(x => x.Id == id && x.Role == "manager" && x.Active)) throw new ApiException(400,"Choose an active property manager."); }
    private async Task CheckUnit(UnitInput input) {
        if (!await db.Users.AnyAsync(x => x.Id == input.UserId && x.Role == "tenant" && x.Active)) throw new ApiException(400,"Choose an active tenant.");
        if (!await db.Properties.AnyAsync(x => x.Id == input.PropertyId && x.Active)) throw new ApiException(400,"Choose an active property.");
    }
}

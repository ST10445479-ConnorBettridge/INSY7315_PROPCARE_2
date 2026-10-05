using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace PropCare.Api;

public static class SeedData
{
    public static async Task BootstrapAdmin(PropCareDb db, IConfiguration config)
    {
        if (await db.Users.AnyAsync(x => x.Role == "admin")) return;
        var email = config["BootstrapAdmin:Email"];
        var password = config["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("An empty production database requires BootstrapAdmin__Email and BootstrapAdmin__Password, or explicit SeedDemo configuration.");
        if (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
            throw new InvalidOperationException("BootstrapAdmin__Email must be valid.");
        AuthService.ValidatePassword(password);
        db.Users.Add(new UserAccount { Name = "Administrator", Email = AuthService.Normalize(email), Role = "admin", PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 12) });
        if (!await db.Settings.AnyAsync()) db.Settings.Add(new WorkspaceSetting());
        await db.SaveChangesAsync();
    }

    public static async Task Load(PropCareDb db, IConfiguration config, string root)
    {
        if (await db.Users.AnyAsync()) return;
        var password = config["DemoPassword"] ?? throw new InvalidOperationException("Set DemoPassword when enabling demo data.");
        AuthService.ValidatePassword(password);
        var hash = BCrypt.Net.BCrypt.HashPassword(password, 12);
        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root, "seed.json")));
        var data = json.RootElement;
        static string S(JsonElement row, string key) => row.GetProperty(key).GetString() ?? "";
        static DateTimeOffset Stamp(string s) => DateTimeOffset.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal).ToUniversalTime();
        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var u in data.GetProperty("users").EnumerateArray())
            db.Users.Add(new UserAccount { Id = S(u,"id"), Name = S(u,"name"), Email = S(u,"email"), Role = S(u,"role"), PasswordHash = hash });
        foreach (var p in data.GetProperty("properties").EnumerateArray())
            db.Properties.Add(new Property { Id = S(p,"id"), Name = S(p,"name"), Address = S(p,"address"), Area = S(p,"area"), ManagerId = S(p,"manager_id") });
        foreach (var c in data.GetProperty("categories").EnumerateArray()) db.Categories.Add(new Category { Id = S(c,"id"), Name = S(c,"name") });
        foreach (var t in data.GetProperty("technicians").EnumerateArray()) db.Technicians.Add(new Technician { Id = S(t,"id"), UserId = S(t,"user_id"), Skill = S(t,"skill") });
        foreach (var u in data.GetProperty("units").EnumerateArray()) db.Units.Add(new TenantUnit { UserId = S(u,"user_id"), PropertyId = S(u,"property_id"), Name = S(u,"name") });
        db.Settings.Add(new WorkspaceSetting());
        await db.SaveChangesAsync();
        var units = await db.Units.ToListAsync();
        foreach (var r in data.GetProperty("requests").EnumerateArray()) {
            var unit = units.Single(x => x.UserId == S(r,"tenant_id") && x.PropertyId == S(r,"property_id") && x.Name == S(r,"unit"));
            db.Requests.Add(new MaintenanceRequest { Id = S(r,"id"), UnitId = unit.Id, PropertyId = unit.PropertyId, TenantId = unit.UserId,
                CategoryId = S(r,"category"), Title = S(r,"title"), Detail = S(r,"detail"), Urgency = S(r,"urgency"), Status = S(r,"status"),
                TechnicianId = r.GetProperty("tech_id").ValueKind == JsonValueKind.Null ? null : S(r,"tech_id"), CreatedAt = Stamp(S(r,"created")), UpdatedAt = Stamp(S(r,"updated")) });
        }
        foreach (var c in data.GetProperty("comments").EnumerateArray()) db.Comments.Add(new RequestComment { RequestId = S(c,"request_id"), UserId = S(c,"user_id"), Text = S(c,"text"), CreatedAt = Stamp(S(c,"created_at")) });
        foreach (var h in data.GetProperty("history").EnumerateArray()) db.History.Add(new StatusHistory { RequestId = S(h,"request_id"), Status = S(h,"status"), CreatedAt = Stamp(S(h,"created_at")) });
        foreach (var r in data.GetProperty("ratings").EnumerateArray()) db.Ratings.Add(new RequestRating { RequestId = S(r,"request_id"), UserId = S(r,"user_id"), Stars = r.GetProperty("stars").GetInt32(), CreatedAt = Stamp(S(r,"created_at")) });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }
}

// Migrations do not require credentials or a running application host.
public class DesignTimeDbFactory : IDesignTimeDbContextFactory<PropCareDb>
{
    public PropCareDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<PropCareDb>()
        .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__PropCare") ?? "Host=localhost;Database=propcare;Username=propcare").Options);
}

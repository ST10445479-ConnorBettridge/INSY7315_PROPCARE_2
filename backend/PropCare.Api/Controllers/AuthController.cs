using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace PropCare.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(PropCareDb db, AuthService auth) : ControllerBase
{
    [HttpPost("login"), EnableRateLimiting("auth")]
    public async Task<object> Login(LoginInput input) => new { data = await auth.Login(input, Response) };
    [HttpPost("refresh"), EnableRateLimiting("auth")]
    public async Task<object> Refresh() => new { data = await auth.Refresh(Request, Response) };
    [HttpPost("logout")]
    public async Task<object> Logout() { await auth.Logout(Request, Response); return new { message = "Signed out." }; }
    [HttpGet("me"), Authorize]
    public object Me() => new { data = new { user = AuthService.PublicUser((UserAccount)HttpContext.Items["account"]!) } };
    [HttpPost("register"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(RegisterInput input)
    {
        AuthService.ValidatePassword(input.Password);
        var email = AuthService.Normalize(input.Email);
        if (await db.Users.AnyAsync(x => x.Email == email)) throw new ApiException(409, "An account already uses this email.");
        var u = new UserAccount { Name = input.Name.Trim(), Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password, 12) };
        db.Users.Add(u);
        foreach (var admin in await db.Users.Where(x => x.Active && x.Role == "admin").ToListAsync())
            db.Notifications.Add(new Notification { UserId = admin.Id, Title = $"New tenant {u.Name} registered. Assign their property and unit after verification." });
        await db.SaveChangesAsync();
        return StatusCode(201, new { message = "Account created. Sign in; your administrator will link your verified property and unit." });
    }
}

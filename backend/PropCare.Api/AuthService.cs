using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace PropCare.Api;

public class AuthService(PropCareDb db, IConfiguration config, IWebHostEnvironment env)
{
    public const string Cookie = "propcare_refresh";
    public static object PublicUser(UserAccount u) => new { u.Id, u.Name, u.Email, u.Role, u.Active };
    public static string Normalize(string email) => email.Trim().ToLowerInvariant();
    public static void ValidatePassword(string password)
    {
        if (password.Length < 10 || Encoding.UTF8.GetByteCount(password) > 72 ||
            !password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            throw new ApiException(400, "Use 10 or more characters with uppercase, lowercase and a number; maximum 72 UTF-8 bytes.");
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private CookieOptions CookieOptions => new() { HttpOnly = true, Secure = !env.IsDevelopment(), SameSite = SameSiteMode.Strict, Path = "/api/auth", Expires = DateTimeOffset.UtcNow.AddDays(7) };
    private async Task<object> Issue(UserAccount u, RefreshSession session, HttpResponse response)
    {
        var refresh = Convert.ToHexString(RandomNumberGenerator.GetBytes(48));
        session.TokenHash = Hash(refresh);
        session.ExpiresAt = DateTimeOffset.UtcNow.AddDays(7);
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, u.Id), new Claim(ClaimTypes.Role, u.Role), new Claim("sid", session.Id) };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
        var token = new JwtSecurityToken("propcare", "propcare-api", claims, expires: DateTime.UtcNow.AddMinutes(15), signingCredentials: new(key, SecurityAlgorithms.HmacSha256));
        // A losing concurrent refresh must never overwrite the browser's valid cookie.
        await db.SaveChangesAsync();
        response.Cookies.Append(Cookie, refresh, CookieOptions);
        return new { user = PublicUser(u), token = new JwtSecurityTokenHandler().WriteToken(token) };
    }
    public async Task<object> Login(LoginInput input, HttpResponse response)
    {
        if (Encoding.UTF8.GetByteCount(input.Password) > 72) throw new ApiException(400,"Password exceeds the 72-byte limit.");
        var u = await db.Users.SingleOrDefaultAsync(x => x.Email == Normalize(input.Email));
        if (u?.LockedUntil > DateTimeOffset.UtcNow) throw new ApiException(429, "Too many failed attempts. Try again in 15 minutes.");
        // Use a fixed valid hash to avoid immediately revealing unknown email addresses.
        var hash = u?.PasswordHash ?? "$2a$12$hVuHGtQlNyg4zMfQN0OX4OHdoJycDUeFsHrAT58/oRaRVGiHL.DOi";
        var valid = BCrypt.Net.BCrypt.Verify(input.Password, hash);
        if (u == null || !valid)
        {
            if (u != null) {
                var now = DateTimeOffset.UtcNow;
                // One SQL update prevents concurrent attempts from losing increments.
                await db.Users.Where(x => x.Id == u.Id).ExecuteUpdateAsync(set => set
                    .SetProperty(x => x.FailedLogins, x => x.LockedUntil != null && x.LockedUntil <= now ? 1 : x.FailedLogins + 1)
                    .SetProperty(x => x.LockedUntil, x => x.LockedUntil != null && x.LockedUntil <= now ? null : x.FailedLogins >= 4 ? now.AddMinutes(15) : x.LockedUntil));
            }
            throw new ApiException(401, "Invalid email or password.");
        }
        if (!u.Active) throw new ApiException(403, "Your account is disabled. Contact your administrator.");
        u.FailedLogins = 0; u.LockedUntil = null;
        var session = new RefreshSession { UserId = u.Id };
        db.Sessions.Add(session);
        return await Issue(u, session, response);
    }
    public async Task<object> Refresh(HttpRequest request, HttpResponse response)
    {
        CheckSameOrigin(request);
        var raw = request.Cookies[Cookie];
        if (string.IsNullOrEmpty(raw)) throw new ApiException(401, "Please sign in.");
        var hash = Hash(raw);
        var session = await db.Sessions.Include(x => x.User).SingleOrDefaultAsync(x => x.TokenHash == hash);
        if (session == null || session.Revoked || session.ExpiresAt <= DateTimeOffset.UtcNow || !session.User.Active)
            throw new ApiException(401, "Your session has expired. Please sign in.");
        return await Issue(session.User, session, response);
    }
    public async Task Logout(HttpRequest request, HttpResponse response)
    {
        CheckSameOrigin(request);
        var raw = request.Cookies[Cookie];
        var sid = request.HttpContext.User.FindFirstValue("sid");
        var uid = request.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(raw) || sid != null) {
            var hash = string.IsNullOrEmpty(raw) ? "" : Hash(raw);
            await db.Sessions.Where(x => x.TokenHash == hash || (x.Id == sid && x.UserId == uid)).ExecuteUpdateAsync(x => x.SetProperty(s => s.Revoked, true));
        }
        response.Cookies.Delete(Cookie, new CookieOptions { Path = "/api/auth", Secure = !env.IsDevelopment(), HttpOnly = true, SameSite = SameSiteMode.Strict });
    }
    private static void CheckSameOrigin(HttpRequest request)
    {
        if (request.Headers["X-PropCare"] != "1") throw new ApiException(403, "Missing request verification header.");
    }
}

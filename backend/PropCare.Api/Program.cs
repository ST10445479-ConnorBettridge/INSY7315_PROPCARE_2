using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using PropCare.Api;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment())
    builder.Configuration.AddJsonFile(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../../.local/settings.json")), optional: true).AddEnvironmentVariables();
var connection = builder.Configuration.GetConnectionString("PropCare") ?? throw new InvalidOperationException("ConnectionStrings__PropCare must be configured.");
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt__Key must be configured.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32) throw new InvalidOperationException("Jwt__Key must contain at least 32 bytes.");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 8 * 1024 * 1024);
builder.Services.AddDbContext<PropCareDb>(o => o.UseNpgsql(connection));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<IRequestRepository, RequestRepository>();
builder.Services.AddScoped<IStatusObserver, InAppNotificationObserver>();
builder.Services.AddScoped<RequestEvents>();
builder.Services.AddScoped<RequestService>();
builder.Services.AddControllers().ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = c =>
    new BadRequestObjectResult(new { message = string.Join(" ", c.ModelState.Values.SelectMany(v => v.Errors).Select(e => string.IsNullOrEmpty(e.ErrorMessage) ? "Invalid input." : e.ErrorMessage)) }));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o => {
    o.TokenValidationParameters = new() {
        ValidateIssuer = true, ValidIssuer = "propcare", ValidateAudience = true, ValidAudience = "propcare-api",
        ValidateLifetime = true, ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256], ClockSkew = TimeSpan.FromSeconds(15)
    };
    o.Events = new JwtBearerEvents { OnTokenValidated = async c => {
        var db = c.HttpContext.RequestServices.GetRequiredService<PropCareDb>();
        var uid = c.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var sid = c.Principal?.FindFirstValue("sid");
        var session = await db.Sessions.Include(x => x.User).SingleOrDefaultAsync(x => x.Id == sid && x.UserId == uid);
        if (session == null || session.Revoked || session.ExpiresAt <= DateTimeOffset.UtcNow || !session.User.Active) { c.Fail("Session is no longer valid."); return; }
        var identity = (ClaimsIdentity)c.Principal!.Identity!;
        foreach (var claim in identity.FindAll(ClaimTypes.Role).ToList()) identity.RemoveClaim(claim);
        identity.AddClaim(new Claim(ClaimTypes.Role, session.User.Role));
        c.HttpContext.Items["account"] = session.User;
    }};
});
builder.Services.AddAuthorization();
builder.Services.Configure<ForwardedHeadersOptions>(o => {
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    foreach (var address in builder.Configuration.GetSection("Proxy:KnownProxies").Get<string[]>() ?? [])
        o.KnownProxies.Add(System.Net.IPAddress.Parse(address));
});
builder.Services.AddRateLimiter(o => {
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Environment.IsEnvironment("Testing") ? 1000 : 30, Window = TimeSpan.FromMinutes(1) }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 1200, Window = TimeSpan.FromMinutes(1) }));
});
var app = builder.Build();
// Only explicitly trusted proxies (and the framework's loopback defaults) may forward client headers.
app.UseForwardedHeaders();
app.Use(async (context, next) => {
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (Exception error) {
        var (status, message) = error switch {
            ApiException e => (e.Status, e.Message),
            DbUpdateConcurrencyException => (409, "This record changed. Refresh and try again."),
            DbUpdateException { InnerException: PostgresException { SqlState: "23505" } } => (409, "A record with these details already exists."),
            DbUpdateException => (400, "This change conflicts with linked records."),
            BadHttpRequestException => (400, "Invalid request body."),
            _ => (500, "Unable to complete the request. Please try again.")
        };
        if (status == 500) app.Logger.LogError(error, "Request failed");
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { message });
    }
});
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) app.UseHsts();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = c.File.Name == "index.html" ? "no-cache" : "public,max-age=3600" });
app.MapControllers();
app.MapGet("/api/health", async (PropCareDb db) => await db.Database.CanConnectAsync()
    ? Results.Ok(new { status = "success", database = "PostgreSQL", version = Environment.GetEnvironmentVariable("RELEASE_SHA") ?? Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") ?? "local" }) : Results.StatusCode(503));
app.MapGet("/api", () => Results.Ok(new { name = "PropCare", stack = "React / ASP.NET Core / PostgreSQL", resources = new[] { "auth", "requests", "properties", "units", "categories", "technicians", "users", "notifications", "reports", "settings" } }));
app.Map("/api/{**path}", () => Results.NotFound(new { message = "Endpoint not found." }));
app.MapFallbackToFile("index.html");
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<PropCareDb>();
    if (builder.Configuration.GetValue("Database:ApplyMigrations", true)) await db.Database.MigrateAsync();
    if (builder.Configuration.GetValue("SeedDemo", app.Environment.IsDevelopment())) await SeedData.Load(db, builder.Configuration, app.Environment.ContentRootPath);
    else await SeedData.BootstrapAdmin(db, builder.Configuration);
}
app.Run();

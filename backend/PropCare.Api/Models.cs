using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public static class Domain
{
    public static readonly string[] Roles = ["tenant", "manager", "technician", "admin"];
    public static readonly string[] Urgencies = ["low", "normal", "high", "urgent"];
    public static readonly string[] OpenStatuses = ["submitted", "under-review", "assigned", "in-progress", "on-hold"];
    public static string Id(string prefix) => prefix + Guid.NewGuid().ToString("N");
}

public class UserAccount
{
    public string Id { get; set; } = Domain.Id("U");
    [MaxLength(100)] public string Name { get; set; } = "";
    [MaxLength(254)] public string Email { get; set; } = "";
    [JsonIgnore] public string PasswordHash { get; set; } = "";
    [MaxLength(20)] public string Role { get; set; } = "tenant";
    public bool Active { get; set; } = true;
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class Property
{
    public string Id { get; set; } = Domain.Id("P");
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(250)] public string Address { get; set; } = "";
    [MaxLength(100)] public string Area { get; set; } = "";
    public string ManagerId { get; set; } = "";
    public UserAccount Manager { get; set; } = null!;
    public bool Active { get; set; } = true;
}
public class TenantUnit
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    public string PropertyId { get; set; } = "";
    public Property Property { get; set; } = null!;
    [MaxLength(120)] public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}
public class Category
{
    public string Id { get; set; } = Domain.Id("C");
    [MaxLength(80)] public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}
public class Technician
{
    public string Id { get; set; } = Domain.Id("T");
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    [MaxLength(120)] public string Skill { get; set; } = "General maintenance";
}
public class MaintenanceRequest
{
    public string Id { get; set; } = Domain.Id("REQ-");
    public string PropertyId { get; set; } = "";
    public Property Property { get; set; } = null!;
    public string TenantId { get; set; } = "";
    public UserAccount Tenant { get; set; } = null!;
    public int UnitId { get; set; }
    public TenantUnit Unit { get; set; } = null!;
    public string CategoryId { get; set; } = "";
    public Category Category { get; set; } = null!;
    public string? TechnicianId { get; set; }
    public Technician? Technician { get; set; }
    [MaxLength(120)] public string Title { get; set; } = "";
    [MaxLength(2000)] public string Detail { get; set; } = "";
    [MaxLength(20)] public string Urgency { get; set; } = "normal";
    [MaxLength(20)] public string Status { get; set; } = "submitted";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ScheduledAt { get; set; }
    public uint Version { get; set; }
    public List<RequestComment> Comments { get; set; } = [];
    public List<StatusHistory> History { get; set; } = [];
    public List<RequestPhoto> Photos { get; set; } = [];
    public RequestRating? Rating { get; set; }
}
public class RequestComment
{
    public int Id { get; set; }
    public string RequestId { get; set; } = "";
    public MaintenanceRequest Request { get; set; } = null!;
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    [MaxLength(2000)] public string Text { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class StatusHistory
{
    public int Id { get; set; }
    public string RequestId { get; set; } = "";
    public MaintenanceRequest Request { get; set; } = null!;
    public string? ActorId { get; set; }
    public UserAccount? Actor { get; set; }
    [MaxLength(80)] public string Status { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class RequestRating
{
    public int Id { get; set; }
    public string RequestId { get; set; } = "";
    public MaintenanceRequest Request { get; set; } = null!;
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    public int Stars { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class RequestPhoto
{
    public string Id { get; set; } = Domain.Id("F");
    public string RequestId { get; set; } = "";
    public MaintenanceRequest Request { get; set; } = null!;
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    [MaxLength(120)] public string Filename { get; set; } = "";
    [MaxLength(10)] public string Kind { get; set; } = "issue";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class Notification
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    public string? RequestId { get; set; }
    public MaintenanceRequest? Request { get; set; }
    [MaxLength(500)] public string Title { get; set; } = "";
    public bool Read { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public class RefreshSession
{
    public string Id { get; set; } = Domain.Id("S");
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    [JsonIgnore] public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public bool Revoked { get; set; }
    public uint Version { get; set; }
}
public class WorkspaceSetting
{
    public int Id { get; set; } = 1;
    [MaxLength(80)] public string OrgName { get; set; } = "Obs Realty Group";
}

public record LoginInput([Required, EmailAddress, MaxLength(254)] string Email, [Required, MaxLength(72)] string Password);
public record RegisterInput([Required, StringLength(100, MinimumLength = 2)] string Name, [Required, EmailAddress, MaxLength(254)] string Email, [Required, StringLength(72, MinimumLength = 10)] string Password);
public record UserInput([Required, StringLength(100, MinimumLength = 2)] string Name, [Required, EmailAddress, MaxLength(254)] string Email, [Required] string Role, bool Active, [MaxLength(72)] string? Password);
public record ProfileInput([Required, StringLength(100, MinimumLength = 2)] string Name, [Required, EmailAddress, MaxLength(254)] string Email, [MaxLength(72)] string? Password, [MaxLength(72)] string? CurrentPassword);
public record PropertyInput([Required, StringLength(120, MinimumLength = 2)] string Name, [Required, MaxLength(250)] string Address, [Required, MaxLength(100)] string Area, [Required] string ManagerId, bool Active = true);
public record UnitInput([Required] string UserId, [Required] string PropertyId, [Required, StringLength(120, MinimumLength = 1)] string Name, bool Active = true);
public record CategoryInput([Required, StringLength(80, MinimumLength = 2)] string Name, bool Active = true);
public record TechnicianInput([Required] string UserId, [Required, MaxLength(120)] string Skill);
public record RequestInput([Required, MaxLength(120)] string Title, [Required, MaxLength(2000)] string Detail, int UnitId, [Required] string CategoryId, [Required] string Urgency);
public record AssignmentInput([Required] string TechnicianId, [Required] string Urgency, [MaxLength(1000)] string? Note, DateTimeOffset? ScheduledAt);
public record ActionInput([Required] string Action, [MaxLength(1000)] string? Note);
public record CommentInput([Required, MaxLength(2000)] string Text);
public record RatingInput([Range(1, 5)] int Stars);
public record SettingsInput([Required, StringLength(80, MinimumLength = 2)] string OrgName);
public record PhotoInput([Required, MaxLength(120)] string Filename, [Required] string Kind, [Required, MaxLength(7_000_000)] string Data);

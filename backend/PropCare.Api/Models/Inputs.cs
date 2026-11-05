using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

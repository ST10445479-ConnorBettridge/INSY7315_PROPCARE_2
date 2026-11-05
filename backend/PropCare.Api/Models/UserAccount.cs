using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

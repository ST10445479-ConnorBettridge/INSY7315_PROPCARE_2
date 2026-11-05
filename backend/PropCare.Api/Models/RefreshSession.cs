using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

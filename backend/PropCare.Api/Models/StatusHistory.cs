using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

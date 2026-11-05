using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public class Notification
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    public string? RequestId { get; set; }
    public MaintenanceRequest? Request { get; set; }
    [MaxLength(500)] public string Title { get; set; } = "";
    public bool Read { get; set; }
    public bool EmailPending { get; set; }
    public int EmailAttempts { get; set; }
    public DateTimeOffset? EmailSentAt { get; set; }
    public DateTimeOffset? EmailNextAttemptAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

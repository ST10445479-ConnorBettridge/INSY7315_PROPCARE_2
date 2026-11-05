using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

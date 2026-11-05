using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

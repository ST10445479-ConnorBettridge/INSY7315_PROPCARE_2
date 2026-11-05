using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

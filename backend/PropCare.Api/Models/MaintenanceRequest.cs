using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

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

using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public class Technician
{
    public string Id { get; set; } = Domain.Id("T");
    public string UserId { get; set; } = "";
    public UserAccount User { get; set; } = null!;
    [MaxLength(120)] public string Skill { get; set; } = "General maintenance";
}

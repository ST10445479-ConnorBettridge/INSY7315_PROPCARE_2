using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public class Property
{
    public string Id { get; set; } = Domain.Id("P");
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(250)] public string Address { get; set; } = "";
    [MaxLength(100)] public string Area { get; set; } = "";
    public string ManagerId { get; set; } = "";
    public UserAccount Manager { get; set; } = null!;
    public bool Active { get; set; } = true;
}

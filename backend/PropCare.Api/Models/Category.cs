using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public class Category
{
    public string Id { get; set; } = Domain.Id("C");
    [MaxLength(80)] public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}

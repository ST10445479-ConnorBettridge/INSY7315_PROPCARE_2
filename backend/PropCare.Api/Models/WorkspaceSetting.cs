using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public class WorkspaceSetting
{
    public int Id { get; set; } = 1;
    [MaxLength(80)] public string OrgName { get; set; } = "Obs Realty Group";
}

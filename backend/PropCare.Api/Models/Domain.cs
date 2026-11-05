using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PropCare.Api;

public static class Domain
{
    public static readonly string[] Roles = ["tenant", "manager", "technician", "admin"];
    public static readonly string[] Urgencies = ["low", "normal", "high", "urgent"];
    public static readonly string[] OpenStatuses = ["submitted", "under-review", "assigned", "in-progress", "on-hold"];
    public static string Id(string prefix) => prefix + Guid.NewGuid().ToString("N");
}

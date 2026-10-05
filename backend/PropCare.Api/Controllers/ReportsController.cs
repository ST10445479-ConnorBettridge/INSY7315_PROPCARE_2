using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace PropCare.Api.Controllers;

[ApiController, Authorize(Roles = "manager,admin"), Route("api/reports")]
public class ReportsController(IRequestRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<object> Summary()
    {
        var query = repository.Visible((UserAccount)HttpContext.Items["account"]!);
        var open = query.Where(x => Domain.OpenStatuses.Contains(x.Status));
        var completed = query.Where(x => x.Status == "completed" || x.Status == "closed");
        return new { data = new {
            total = await query.CountAsync(), open = await open.CountAsync(), completed = await completed.CountAsync(),
            urgent = await open.CountAsync(x => x.Urgency == "urgent" || x.Urgency == "high"),
            byCategory = await query.GroupBy(x => x.Category.Name).Select(g => new { name = g.Key, count = g.Count() }).OrderByDescending(x => x.count).ToListAsync(),
            byProperty = await open.GroupBy(x => new { x.Property.Id, x.Property.Name }).Select(g => new { id = g.Key.Id, name = g.Key.Name, count = g.Count() }).OrderByDescending(x => x.count).ToListAsync(),
            byStatus = await query.GroupBy(x => x.Status).Select(g => new { name = g.Key, count = g.Count() }).ToListAsync(),
            technicians = await completed.Where(x => x.Technician != null).GroupBy(x => new { x.Technician!.Id, x.Technician.User.Name })
                .Select(g => new { id = g.Key.Id, name = g.Key.Name, completed = g.Count(), rating = g.Average(x => x.Rating != null ? (double?)x.Rating.Stars : null) }).ToListAsync()
        }};
    }
}

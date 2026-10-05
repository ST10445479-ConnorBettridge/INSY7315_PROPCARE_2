using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace PropCare.Api.Controllers;

[ApiController, Authorize, Route("api/requests")]
public class RequestsController(IRequestRepository repository, RequestService service, PropCareDb db, PhotoStore photos) : ControllerBase
{
    private UserAccount Account => (UserAccount)HttpContext.Items["account"]!;
    private IQueryable<MaintenanceRequest> Filter(string? status, string? q)
    {
        var query = repository.Visible(Account).AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(q)) {
            if (q.Length > 120) throw new ApiException(400,"Search is too long.");
            var pattern = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(x => EF.Functions.ILike(x.Title, pattern) || EF.Functions.ILike(x.Id, pattern) || EF.Functions.ILike(x.Property.Name, pattern));
        }
        return query;
    }
    [HttpGet("page")]
    public async Task<object> Page([FromQuery] string? status, [FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
    {
        if (page < 1 || page > 100000 || pageSize < 1 || pageSize > 100) throw new ApiException(400,"Choose a valid page and a page size from 1 to 100.");
        var query = Filter(status,q);
        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page-1)*pageSize).Take(pageSize).ToListAsync();
        return new { data = new { items = rows.Select(RequestService.Summary), total, page, pageSize } };
    }
    [HttpGet("overview")]
    public async Task<object> Overview()
    {
        var query = repository.Visible(Account).AsNoTracking();
        return new { data = new {
            total = await query.CountAsync(), open = await query.CountAsync(x => Domain.OpenStatuses.Contains(x.Status)),
            awaiting = await query.CountAsync(x => x.Status == "completed"), completed = await query.CountAsync(x => x.Status == "completed" || x.Status == "closed"),
            recent = (await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(6).ToListAsync()).Select(RequestService.Summary)
        }};
    }
    [HttpGet("scheduled")]
    public async Task<object> Scheduled() => new { data = (await repository.Visible(Account).AsNoTracking()
        .Where(x => x.ScheduledAt != null && Domain.OpenStatuses.Contains(x.Status))
        .OrderBy(x => x.ScheduledAt).ThenBy(x => x.Id).ToListAsync()).Select(RequestService.Summary) };
    [HttpGet]
    public async Task<object> List([FromQuery] string? status, [FromQuery] string? q)
    {
        var query = Filter(status,q);
        return new { data = (await query.OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync()).Select(RequestService.Summary) };
    }
    [HttpGet("{id}")] public async Task<object> Detail(string id) => new { data = service.Detail(await repository.Find(id,Account), Account) };
    [HttpPost] public async Task<IActionResult> Create(RequestInput input) => StatusCode(201,new { data = RequestService.Summary(await service.Create(Account,input)) });
    [HttpPost("{id}/assign")] public async Task<object> Assign(string id, AssignmentInput input) => new { data = service.Detail(await service.Assign(Account,id,input),Account) };
    [HttpPost("{id}/status")] public async Task<object> Status(string id, ActionInput input) => new { data = service.Detail(await service.Act(Account,id,input),Account) };
    [HttpPost("{id}/comments")] public async Task<object> Comment(string id, CommentInput input) { await service.Comment(Account,id,input.Text); return new { message = "Comment added." }; }
    [HttpPost("{id}/rate")] public async Task<object> Rate(string id, RatingInput input) { await service.Rate(Account,id,input.Stars); return new { message = "Rating recorded." }; }
    [HttpPost("{id}/photos")] public async Task<IActionResult> Upload(string id, PhotoInput input) { await service.Upload(Account,id,input); return StatusCode(201,new { message = "Photo uploaded." }); }
    [HttpGet("{id}/photos/{photoId}")]
    public async Task<IActionResult> Photo(string id,string photoId)
    {
        await repository.Find(id,Account);
        var photo = await db.Photos.SingleOrDefaultAsync(x => x.Id == photoId && x.RequestId == id) ?? throw new ApiException(404,"Photo not found.");
        return File(await photos.Read(photo.Id),"image/jpeg");
    }
}

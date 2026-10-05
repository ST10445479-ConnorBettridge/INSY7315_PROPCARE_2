using Microsoft.EntityFrameworkCore;

namespace PropCare.Api;

public interface IRequestRepository
{
    IQueryable<MaintenanceRequest> Visible(UserAccount user);
    Task<MaintenanceRequest> Find(string id, UserAccount user);
    void Add(MaintenanceRequest request);
    Task Save();
}

public class RequestRepository(PropCareDb db) : IRequestRepository
{
    public IQueryable<MaintenanceRequest> Visible(UserAccount u)
    {
        var query = db.Requests.Include(x => x.Property).Include(x => x.Unit).Include(x => x.Category)
            .Include(x => x.Tenant).Include(x => x.Technician)!.ThenInclude(x => x!.User).AsQueryable();
        return u.Role switch {
            "admin" => query,
            "manager" => query.Where(x => x.Property.ManagerId == u.Id),
            "technician" => query.Where(x => x.Technician != null && x.Technician.UserId == u.Id),
            _ => query.Where(x => x.TenantId == u.Id)
        };
    }
    public async Task<MaintenanceRequest> Find(string id, UserAccount u) =>
        await Visible(u).Include(x => x.Comments).ThenInclude(x => x.User)
            .Include(x => x.History).ThenInclude(x => x.Actor).Include(x => x.Photos).Include(x => x.Rating)
            .AsSplitQuery().SingleOrDefaultAsync(x => x.Id == id)
        ?? throw new ApiException(404, "Request not found or you do not have access.");
    public void Add(MaintenanceRequest r) => db.Requests.Add(r);
    public Task Save() => db.SaveChangesAsync();
}

public record RequestEvent(MaintenanceRequest Request, UserAccount Actor, string Message);
public interface IStatusObserver { void Notify(RequestEvent change); }
public class InAppNotificationObserver(PropCareDb db) : IStatusObserver
{
    public void Notify(RequestEvent e)
    {
        var recipients = new[] { e.Request.TenantId, e.Request.Property.ManagerId, e.Request.Technician?.UserId };
        foreach (var id in recipients.Where(x => x != null && x != e.Actor.Id).Distinct())
            db.Notifications.Add(new Notification { UserId = id!, RequestId = e.Request.Id, Title = e.Message });
    }
}
public class RequestEvents(IEnumerable<IStatusObserver> observers)
{
    // Notifications join the same SaveChanges transaction as the status and audit history.
    public void Publish(RequestEvent e) { foreach (var observer in observers) observer.Notify(e); }
}
public class ApiException(int status, string message) : Exception(message) { public int Status { get; } = status; }

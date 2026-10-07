using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace PropCare.Api;

public class RequestService(PropCareDb db, IRequestRepository repository, RequestEvents events, PhotoStore photos, ILogger<RequestService> logger)
{
    public static string[] Actions(UserAccount user, MaintenanceRequest r) => user.Role switch {
        "tenant" when r.Status is "submitted" or "under-review" => ["cancel"],
        "tenant" when r.Status == "completed" => ["confirm", "reopen"],
        "manager" when r.Status is "submitted" or "under-review" => ["review", "reject", "assign"],
        "manager" when r.Status == "rejected" => ["assign"],
        "manager" when r.Status == "completed" => ["approve"],
        "manager" when r.Status is "assigned" or "in-progress" or "on-hold" => ["schedule"],
        "technician" when r.Status == "assigned" => ["accept", "reject"],
        "technician" when r.Status == "in-progress" => ["hold", "complete"],
        "technician" when r.Status == "on-hold" => ["resume"],
        _ => []
    };
    public static object Summary(MaintenanceRequest r) => new {
        r.Id, r.Title, r.Detail, r.Status, r.Urgency, r.CreatedAt, r.UpdatedAt, r.ScheduledAt,
        r.PropertyId, propertyName = r.Property.Name, unit = r.Unit.Name, r.UnitId,
        r.CategoryId, categoryName = r.Category.Name, r.TenantId, tenantName = r.Tenant.Name,
        r.TechnicianId, technicianName = r.Technician?.User.Name
    };
    public object Detail(MaintenanceRequest r, UserAccount u) => new {
        request = Summary(r), actions = Actions(u,r), rating = r.Rating?.Stars,
        canRate = u.Role == "tenant" && r.TenantId == u.Id && r.Status is "completed" or "closed" && r.Rating == null,
        comments = r.Comments.OrderBy(x => x.CreatedAt).Select(x => new { x.Id, x.Text, x.CreatedAt, name = x.User.Name, role = x.User.Role }),
        history = r.History.OrderBy(x => x.CreatedAt).Select(x => new { x.Id, x.Status, x.CreatedAt, actor = x.Actor?.Name }),
        photos = r.Photos.OrderBy(x => x.CreatedAt).Select(x => new { x.Id, x.Filename, x.Kind, x.CreatedAt })
    };
    public async Task<MaintenanceRequest> Create(UserAccount u, RequestInput input)
    {
        if (u.Role != "tenant") throw new ApiException(403, "Only tenants can report a maintenance issue.");
        var unit = await db.Units.Include(x => x.Property).SingleOrDefaultAsync(x => x.Id == input.UnitId && x.UserId == u.Id && x.Active && x.Property.Active)
            ?? throw new ApiException(400, "Select one of your assigned units.");
        if (!await db.Categories.AnyAsync(x => x.Id == input.CategoryId && x.Active)) throw new ApiException(400, "Choose an active category.");
        CheckUrgency(input.Urgency);
        var r = new MaintenanceRequest { Title = input.Title.Trim(), Detail = input.Detail.Trim(), UnitId = unit.Id, PropertyId = unit.PropertyId,
            Property = unit.Property, TenantId = u.Id, CategoryId = input.CategoryId, Urgency = input.Urgency };
        repository.Add(r);
        Record(r, u, "Request submitted.");
        await repository.Save();
        return await repository.Find(r.Id,u);
    }
    public async Task<MaintenanceRequest> Assign(UserAccount u, string id, AssignmentInput input)
    {
        var r = await repository.Find(id,u);
        if (!Actions(u,r).Contains("assign") && !Actions(u,r).Contains("schedule")) throw new ApiException(403, "You cannot assign or schedule this request.");
        CheckUrgency(input.Urgency);
        var t = await db.Technicians.Include(x => x.User).SingleOrDefaultAsync(x => x.Id == input.TechnicianId && x.User.Active && x.User.Role == "technician")
            ?? throw new ApiException(400, "Choose an active technician.");
        if (Actions(u,r).Contains("schedule") && r.TechnicianId != t.Id) throw new ApiException(400, "An active job must stay with its assigned technician.");
        if (input.ScheduledAt < DateTimeOffset.UtcNow.AddMinutes(-1)) throw new ApiException(400, "Choose a future visit date and time.");
        r.TechnicianId = t.Id; r.Technician = t; r.Urgency = input.Urgency; r.ScheduledAt = input.ScheduledAt?.ToUniversalTime();
        if (Actions(u,r).Contains("assign")) r.Status = "assigned";
        Record(r,u, string.IsNullOrWhiteSpace(input.Note) ? $"Assigned to {t.User.Name}." : input.Note.Trim());
        await repository.Save(); return r;
    }
    public async Task<MaintenanceRequest> Act(UserAccount u, string id, ActionInput input)
    {
        var r = await repository.Find(id,u);
        if (!Actions(u,r).Contains(input.Action) || input.Action is "assign" or "schedule") throw new ApiException(400, "This action is not allowed for the current status and role.");
        r.Status = input.Action switch {
            "review" => "under-review", "cancel" => "cancelled", "confirm" or "approve" => "closed", "reject" => "rejected",
            "accept" or "resume" or "reopen" => "in-progress", "hold" => "on-hold", "complete" => "completed", _ => r.Status
        };
        Record(r,u, string.IsNullOrWhiteSpace(input.Note) ? $"{u.Name}: {input.Action}." : input.Note.Trim());
        await repository.Save(); return r;
    }
    public async Task Comment(UserAccount u, string id, string text)
    {
        var r = await repository.Find(id,u);
        db.Comments.Add(new RequestComment { RequestId = id, UserId = u.Id, Text = text.Trim() });
        events.Publish(new RequestEvent(r,u,$"{u.Name} commented on {r.Title}."));
        await repository.Save();
    }
    public async Task Rate(UserAccount u, string id, int stars)
    {
        var r = await repository.Find(id,u);
        if (u.Role != "tenant" || r.TenantId != u.Id || r.Status is not ("completed" or "closed")) throw new ApiException(403,"Only the reporting tenant can rate completed work.");
        if (r.Rating != null) throw new ApiException(409,"This request has already been rated.");
        db.Ratings.Add(new RequestRating { RequestId = id, UserId = u.Id, Stars = stars });
        events.Publish(new RequestEvent(r,u,$"{u.Name} rated {r.Title}: {stars}/5."));
        await repository.Save();
    }
    public async Task Upload(UserAccount u, string id, PhotoInput input)
    {
        var r = await repository.Find(id,u);
        if (r.Photos.Count >= 10) throw new ApiException(400,"A request can have up to ten photos.");
        if (!new[] {"issue","before","after"}.Contains(input.Kind) || (u.Role == "tenant" && input.Kind != "issue")) throw new ApiException(400,"Choose a valid photo type for your role.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(input.Data); } catch (FormatException) { throw new ApiException(400,"Invalid photo data."); }
        if (bytes.Length > 5 * 1024 * 1024) throw new ApiException(413,"The photo must be 5 MB or smaller.");
        var filename = Path.GetFileNameWithoutExtension(input.Filename);
        var photo = new RequestPhoto { RequestId = id, UserId = u.Id, Kind = input.Kind, Filename = filename[..Math.Min(filename.Length, 116)] + ".jpg" };
        using var jpeg = new MemoryStream();
        try {
            var info = Image.Identify(bytes);
            if ((long)info.Width * info.Height > 20_000_000) throw new ApiException(400,"Photo dimensions are too large.");
            var format = info.Metadata.DecodedImageFormat?.Name;
            if (format is not ("JPEG" or "PNG" or "WEBP")) throw new ApiException(400,"Use a JPEG, PNG or WebP image.");
            using var image = Image.Load(bytes);
            image.Mutate(x => x.AutoOrient().Resize(new ResizeOptions { Size = new Size(1600,1600), Mode = ResizeMode.Max }));
            image.Metadata.ExifProfile = null; image.Metadata.IccProfile = null; image.Metadata.XmpProfile = null;
            await image.SaveAsJpegAsync(jpeg);
        } catch (UnknownImageFormatException) { throw new ApiException(400,"The file is not a supported image."); }
          catch (InvalidImageContentException) { throw new ApiException(400,"The image file is damaged."); }
        await photos.Save(photo.Id, jpeg.ToArray());
        db.Photos.Add(photo);
        // Advancing the concurrency token protects the ten-photo limit against concurrent uploads.
        r.UpdatedAt = DateTimeOffset.UtcNow;
        try { await repository.Save(); } catch {
            try { await photos.Delete(photo.Id); }
            catch (Exception cleanupError) { logger.LogError(cleanupError, "Unable to remove uncommitted photo {PhotoId}", photo.Id); }
            throw;
        }
    }
    private void Record(MaintenanceRequest r, UserAccount u, string note)
    {
        r.UpdatedAt = DateTimeOffset.UtcNow;
        db.History.Add(new StatusHistory { RequestId = r.Id, ActorId = u.Id, Status = r.Status });
        db.Comments.Add(new RequestComment { RequestId = r.Id, UserId = u.Id, Text = note });
        events.Publish(new RequestEvent(r,u,$"{r.Title}: {r.Status.Replace('-', ' ')}."));
    }
    private static void CheckUrgency(string urgency) { if (!Domain.Urgencies.Contains(urgency)) throw new ApiException(400,"Choose a valid urgency."); }
}

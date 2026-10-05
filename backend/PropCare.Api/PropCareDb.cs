using Microsoft.EntityFrameworkCore;

namespace PropCare.Api;

public class PropCareDb(DbContextOptions<PropCareDb> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<TenantUnit> Units => Set<TenantUnit>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Technician> Technicians => Set<Technician>();
    public DbSet<MaintenanceRequest> Requests => Set<MaintenanceRequest>();
    public DbSet<RequestComment> Comments => Set<RequestComment>();
    public DbSet<StatusHistory> History => Set<StatusHistory>();
    public DbSet<RequestRating> Ratings => Set<RequestRating>();
    public DbSet<RequestPhoto> Photos => Set<RequestPhoto>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<RefreshSession> Sessions => Set<RefreshSession>();
    public DbSet<WorkspaceSetting> Settings => Set<WorkspaceSetting>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<UserAccount>().HasIndex(x => x.Email).IsUnique();
        b.Entity<UserAccount>().ToTable(t => t.HasCheckConstraint("CK_User_Role", "\"Role\" IN ('tenant','manager','technician','admin')"));
        b.Entity<Technician>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<Category>().HasIndex(x => x.Name).IsUnique();
        b.Entity<TenantUnit>().HasIndex(x => new { x.PropertyId, x.Name }).IsUnique().HasFilter("\"Active\" = TRUE");
        b.Entity<TenantUnit>().HasAlternateKey(x => new { x.Id, x.PropertyId, x.UserId });
        b.Entity<MaintenanceRequest>().HasOne(x => x.Unit).WithMany()
            .HasForeignKey(x => new { x.UnitId, x.PropertyId, x.TenantId })
            .HasPrincipalKey(x => new { x.Id, x.PropertyId, x.UserId });
        b.Entity<MaintenanceRequest>().Property(x => x.Version).IsRowVersion();
        b.Entity<RefreshSession>().Property(x => x.Version).IsRowVersion();
        b.Entity<MaintenanceRequest>().HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<MaintenanceRequest>().ToTable(t => {
            t.HasCheckConstraint("CK_Request_Urgency", "\"Urgency\" IN ('low','normal','high','urgent')");
            t.HasCheckConstraint("CK_Request_Status", "\"Status\" IN ('submitted','under-review','assigned','in-progress','on-hold','completed','closed','cancelled','rejected')");
        });
        b.Entity<MaintenanceRequest>().HasOne(x => x.Rating).WithOne(x => x.Request).HasForeignKey<RequestRating>(x => x.RequestId);
        b.Entity<RequestRating>().ToTable(t => t.HasCheckConstraint("CK_Rating_Stars", "\"Stars\" BETWEEN 1 AND 5"));
        b.Entity<RequestPhoto>().ToTable(t => t.HasCheckConstraint("CK_Photo_Kind", "\"Kind\" IN ('issue','before','after')"));
        b.Entity<Notification>().HasIndex(x => new { x.UserId, x.Read, x.CreatedAt });
        b.Entity<RefreshSession>().HasIndex(x => x.TokenHash).IsUnique();
        // Keep maintenance records even when an account or reference record is archived.
        foreach (var fk in b.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys())) fk.DeleteBehavior = DeleteBehavior.Restrict;
    }
}

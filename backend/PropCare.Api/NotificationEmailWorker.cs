using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;

namespace PropCare.Api;

public class NotificationEmailWorker(IServiceScopeFactory scopes, IConfiguration config, ILogger<NotificationEmailWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue<bool>("Email:Enabled")) return;
        if (string.IsNullOrWhiteSpace(config["Email:Host"]) || string.IsNullOrWhiteSpace(config["Email:From"]))
            throw new InvalidOperationException("Enabled email delivery requires Email__Host and Email__From.");
        while (!stoppingToken.IsCancellationRequested) {
            try { await Deliver(stoppingToken); }
            catch (Exception error) when (!stoppingToken.IsCancellationRequested) {
                logger.LogError(error, "Email delivery batch failed; queued notifications remain available for retry.");
            }
            await Task.Delay(TimeSpan.FromSeconds(Math.Clamp(config.GetValue("Email:PollSeconds", 30), 1, 300)), stoppingToken);
        }
    }

    private async Task Deliver(CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PropCareDb>();
        var now = DateTimeOffset.UtcNow;
        var pending = await db.Notifications.AsNoTracking()
            .Where(x => x.EmailPending && x.EmailAttempts < 5 && (x.EmailNextAttemptAt == null || x.EmailNextAttemptAt <= now))
            .OrderBy(x => x.Id).Take(20).Select(x => x.Id).ToListAsync(cancellationToken);
        foreach (var id in pending) {
            // Claim before network IO so another worker cannot send the same queued item concurrently.
            var claimed = await db.Notifications.Where(x => x.Id == id && x.EmailPending && x.EmailAttempts < 5
                && (x.EmailNextAttemptAt == null || x.EmailNextAttemptAt <= now))
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.EmailAttempts, x => x.EmailAttempts + 1)
                    .SetProperty(x => x.EmailNextAttemptAt, now.AddMinutes(5)), cancellationToken);
            if (claimed == 0) continue;
            var notification = await db.Notifications.AsNoTracking().Include(x => x.User).SingleAsync(x => x.Id == id, cancellationToken);
            if (!notification.User.Active) {
                await db.Notifications.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.EmailPending, false), cancellationToken);
                continue;
            }
            try {
                using var client = new SmtpClient(config["Email:Host"], config.GetValue("Email:Port", 587)) {
                    EnableSsl = config.GetValue("Email:UseTls", true), Timeout = 15000
                };
                if (!string.IsNullOrEmpty(config["Email:Username"]))
                    client.Credentials = new NetworkCredential(config["Email:Username"], config["Email:Password"]);
                using var message = new MailMessage(config["Email:From"]!, notification.User.Email) {
                    Subject = "PropCare maintenance update",
                    Body = $"Hello {notification.User.Name},\n\n{notification.Title}\n\nSign in to PropCare to view the request and its history."
                };
                using var sendTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                sendTimeout.CancelAfter(TimeSpan.FromSeconds(15));
                await client.SendMailAsync(message, sendTimeout.Token);
                await db.Notifications.Where(x => x.Id == id).ExecuteUpdateAsync(set => set
                    .SetProperty(x => x.EmailPending, false).SetProperty(x => x.EmailSentAt, DateTimeOffset.UtcNow), cancellationToken);
            } catch (Exception error) when (!cancellationToken.IsCancellationRequested) {
                logger.LogWarning("Notification {NotificationId} email attempt {Attempt} failed ({ErrorType}).", id, notification.EmailAttempts, error.GetType().Name);
                await db.Notifications.Where(x => x.Id == id).ExecuteUpdateAsync(set => set
                    .SetProperty(x => x.EmailPending, notification.EmailAttempts < 5)
                    .SetProperty(x => x.EmailNextAttemptAt, DateTimeOffset.UtcNow.AddSeconds(
                        Math.Max(1, config.GetValue("Email:RetrySeconds", 60)) * Math.Pow(2, notification.EmailAttempts))), cancellationToken);
            }
        }
    }
}

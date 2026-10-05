using System.Net;
using System.Net.Http.Headers;

namespace PropCare.Api;

public class PhotoStore(HttpClient client, IConfiguration config, IWebHostEnvironment env)
{
    private string LocalPath(string id) => Path.Combine(Path.GetFullPath(config["Storage:Path"] ?? Path.Combine(env.ContentRootPath, "../../.local/uploads")), id + ".jpg");
    private bool Remote => !string.IsNullOrWhiteSpace(config["Storage:SupabaseUrl"]);

    private HttpRequestMessage Request(HttpMethod method, string id)
    {
        var root = new Uri(config["Storage:SupabaseUrl"]!.TrimEnd('/') + "/");
        if (root.Scheme != "https" && !(env.IsEnvironment("Testing") && root.IsLoopback))
            throw new InvalidOperationException("Photo storage requires HTTPS.");
        var key = config["Storage:ServiceKey"] ?? throw new InvalidOperationException("Storage__ServiceKey must be configured.");
        var bucket = Uri.EscapeDataString(config["Storage:Bucket"] ?? "propcare-photos");
        var request = new HttpRequestMessage(method, new Uri(root, $"storage/v1/object/{bucket}/{Uri.EscapeDataString(id)}.jpg"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Headers.Add("apikey", key);
        return request;
    }

    public async Task Save(string id, byte[] jpeg)
    {
        if (!Remote) {
            var path = LocalPath(id);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllBytesAsync(path, jpeg);
            return;
        }
        using var request = Request(HttpMethod.Post, id);
        request.Content = new ByteArrayContent(jpeg);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new ApiException(503, "Photo storage is temporarily unavailable. Please try again.");
    }

    public async Task<byte[]> Read(string id)
    {
        if (!Remote) {
            var path = LocalPath(id);
            if (!File.Exists(path)) throw new ApiException(404, "Photo file is unavailable.");
            return await File.ReadAllBytesAsync(path);
        }
        using var request = Request(HttpMethod.Get, id);
        using var response = await client.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.NotFound) throw new ApiException(404, "Photo file is unavailable.");
        if (!response.IsSuccessStatusCode) throw new ApiException(503, "Photo storage is temporarily unavailable. Please try again.");
        return await response.Content.ReadAsByteArrayAsync();
    }

    public async Task Delete(string id)
    {
        if (!Remote) { File.Delete(LocalPath(id)); return; }
        using var request = Request(HttpMethod.Delete, id);
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }
}

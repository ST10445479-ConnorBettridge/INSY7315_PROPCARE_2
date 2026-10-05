FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/PropCare.Api/PropCare.Api.csproj backend/PropCare.Api/
RUN dotnet restore backend/PropCare.Api
COPY backend/ backend/
COPY --from=frontend /src/backend/PropCare.Api/wwwroot/ backend/PropCare.Api/wwwroot/
RUN dotnet publish backend/PropCare.Api -c Release --no-restore -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /publish/ ./
COPY deployment/supabase-ca.crt /app/certs/supabase-ca.crt
RUN mkdir -p /app/storage && chown -R app:app /app/storage
USER app
ENV ASPNETCORE_HTTP_PORTS=8080 Storage__Path=/app/storage
EXPOSE 8080
ENTRYPOINT ["dotnet", "PropCare.Api.dll"]

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PropCare.Api.Migrations
{
    /// <inheritdoc />
    public partial class EnforceRequestTenancy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Requests_Units_UnitId",
                table: "Requests");

            migrationBuilder.DropIndex(
                name: "IX_Requests_UnitId",
                table: "Requests");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Units_Id_PropertyId_UserId",
                table: "Units",
                columns: new[] { "Id", "PropertyId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Requests_UnitId_PropertyId_TenantId",
                table: "Requests",
                columns: new[] { "UnitId", "PropertyId", "TenantId" });

            migrationBuilder.AddForeignKey(
                name: "FK_Requests_Units_UnitId_PropertyId_TenantId",
                table: "Requests",
                columns: new[] { "UnitId", "PropertyId", "TenantId" },
                principalTable: "Units",
                principalColumns: new[] { "Id", "PropertyId", "UserId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Requests_Units_UnitId_PropertyId_TenantId",
                table: "Requests");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Units_Id_PropertyId_UserId",
                table: "Units");

            migrationBuilder.DropIndex(
                name: "IX_Requests_UnitId_PropertyId_TenantId",
                table: "Requests");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_UnitId",
                table: "Requests",
                column: "UnitId");

            migrationBuilder.AddForeignKey(
                name: "FK_Requests_Units_UnitId",
                table: "Requests",
                column: "UnitId",
                principalTable: "Units",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}

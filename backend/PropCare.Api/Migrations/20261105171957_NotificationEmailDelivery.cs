using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PropCare.Api.Migrations
{
    /// <inheritdoc />
    public partial class NotificationEmailDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EmailAttempts",
                table: "Notifications",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EmailNextAttemptAt",
                table: "Notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailPending",
                table: "Notifications",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EmailSentAt",
                table: "Notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_EmailPending_EmailNextAttemptAt",
                table: "Notifications",
                columns: new[] { "EmailPending", "EmailNextAttemptAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Notification_EmailAttempts",
                table: "Notifications",
                sql: "\"EmailAttempts\" BETWEEN 0 AND 5");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notifications_EmailPending_EmailNextAttemptAt",
                table: "Notifications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Notification_EmailAttempts",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "EmailAttempts",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "EmailNextAttemptAt",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "EmailPending",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "EmailSentAt",
                table: "Notifications");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BeatifyServer.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CanImport",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanUpload",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsBlocked",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "UploadRequestedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            // Anyone who is already an artist could publish before this change — keep that working.
            migrationBuilder.Sql("UPDATE \"Users\" SET \"CanUpload\" = TRUE WHERE \"Id\" IN (SELECT \"UserId\" FROM \"Artists\" WHERE \"UserId\" IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CanImport",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CanUpload",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsBlocked",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UploadRequestedAt",
                table: "Users");
        }
    }
}

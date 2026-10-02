using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BeatifyServer.Migrations
{
    /// <inheritdoc />
    public partial class AddUploadDenied : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "UploadDeniedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UploadDeniedAt",
                table: "Users");
        }
    }
}

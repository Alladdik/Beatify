using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BeatifyServer.Migrations
{
    /// <inheritdoc />
    public partial class AddCollaborativePlaylists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsCollaborative",
                table: "Playlists",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsCollaborative",
                table: "Playlists");
        }
    }
}

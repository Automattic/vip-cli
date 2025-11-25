# Export SQL: Skip Download Option

The `vip export sql` command includes a `--skip-download` option that allows you to retrieve the download URL for a database backup without downloading the file. This is useful when you need the URL for automation workflows, want to download the file later, or need to use a different download method.

## Usage

```bash
vip @<app>.<env> export sql --skip-download
```

## Examples

### Get download URL for the latest backup

```bash
vip @example-app.production export sql --skip-download
```

This command will:
1. Prepare the most recent database backup
2. Generate a download URL
3. Display the URL without downloading the file

### Combine with other options

You can combine `--skip-download` with other export options:

```bash
# Get URL for a fresh backup
vip @example-app.production export sql --generate-backup --skip-download

# Get URL for a partial export
vip @example-app.production export sql --table=wp_posts --skip-download

# Get URL for specific sites in a multisite network
vip @example-app.production export sql --site-id=2,3 --skip-download
```

## Output

When using `--skip-download`, the command displays progress information and outputs the download URL:

```
✓ Preparing for backup download 
  • Attaching to an existing export for the backup with timestamp 2025-11-14T13:21:07.000Z
✓ Creating backup copy 
✓ Requesting download link 
  • Download URL: https://example.org/sql.gz

Download URL:
https://example.org/sql.gz
```

## Use Cases

### Automation workflows

Store the URL in a variable for use in scripts:

```bash
#!/bin/bash
OUTPUT=$(vip @example-app.production export sql --skip-download 2>&1)
URL=$(echo "$OUTPUT" | grep -o 'https://[^[:space:]]*')
echo "Backup URL: $URL"
# Use $URL in your automation workflow
```

### Download with custom tools

Get the URL and use your preferred download tool:

```bash
# Get the URL
vip @example-app.production export sql --skip-download

# Download with wget
wget -O backup.sql.gz "https://example.org/sql.gz"

# Or with curl
curl -o backup.sql.gz "https://example.org/sql.gz"
```

### Integration with cloud storage

Retrieve the URL and upload directly to cloud storage without saving locally:

```bash
# Get the URL
URL=$(vip @example-app.production export sql --skip-download 2>&1 | grep -o 'https://[^[:space:]]*')

# Upload directly to S3
wget -O - "$URL" | aws s3 cp - s3://my-bucket/backups/backup.sql.gz
```

## Important Notes

- The download URL is temporary and will expire after a period of time
- When using `--skip-download`, the command skips:
  - Storage space confirmation prompt
  - File download
- The output file path option (`--output`) has no effect when `--skip-download` is used
- The backup must still be prepared and a download URL generated, which may take some time depending on backup size

## Related Commands

- [`vip export sql`](https://docs.wpvip.com/vip-cli/export-sql/) - Download database backups
- [`vip backup db`](https://docs.wpvip.com/vip-cli/backup-db/) - Create database backups

## See Also

- [VIP CLI Export SQL Documentation](https://docs.wpvip.com/vip-cli/export-sql/)
- [Database Backups on WordPress VIP](https://docs.wpvip.com/technical-references/backups/)

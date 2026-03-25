# Generic Restore Checklist

Use this when restoring a claw backup over an existing installation.

## Recommended flow

1. Stop the app or background service that is using the target directory.
2. Rename the current directory to a temporary backup path.
3. Run the `restore` command and choose the archive plus destination directory.
4. Verify critical config files and credentials are present.
5. Start the app again.

## Example

```bash
mv ~/.openclaw ~/.openclaw-before-restore
node scripts/cli.ts restore
```

## Rollback

If the restored data is invalid:

```bash
rm -rf ~/.openclaw
mv ~/.openclaw-before-restore ~/.openclaw
```

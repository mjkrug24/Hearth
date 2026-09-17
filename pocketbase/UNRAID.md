# Hearth with spectado/pocketbase:0.19.2

Keep your current image and existing data mapping. Hearth's hooks and migration
support PocketBase **0.19.2**, with compatibility verified against that executable.

## Install

1. Stop the PocketBase container and back up the host folder currently mapped to
   `/pb_data`. This includes the database and uploaded files.
2. Copy the supplied `pb_hooks` and `pb_migrations` folders into
   `/mnt/user/appdata/hearth-pocketbase/` on Unraid. The layout must be:

   ```text
   /mnt/user/appdata/hearth-pocketbase/
     pb_hooks/
       main.pb.js
       hearth.js
       compat.js
     pb_migrations/
       1710000000_hearth_schema.js
       1789516800_household_sync.js
   ```

3. In **Docker → PocketBase → Edit**, use **Add another Path, Port, Variable,
   Label or Device**, select **Path**, and add these two read/write mappings:

   | Host Path | Container Path |
   | --- | --- |
   | `/mnt/user/appdata/hearth-pocketbase/pb_hooks` | `/pb_hooks` |
   | `/mnt/user/appdata/hearth-pocketbase/pb_migrations` | `/pb_migrations` |

   If these container paths already have mappings, copy Hearth's files into
   the existing host folders instead; preserve other applications' files.
   Keep the existing `/pb_data` mapping and `spectado/pocketbase:0.19.2` repository.
4. Apply the container configuration and start it. PocketBase automatically runs
   the migration and loads the hooks. Check the container log for errors.
5. Reload Hearth, sign in, and open **Settings → Your household**. Create an
   invitation code for the other household member.

No frontend deployment or manual collection creation is needed for this adapter.
The migration modifies only Hearth collections. Existing Hearth items with an
owner stay assigned to that owner's household; reconnect members using invitations.
Unowned historical rows remain preserved for an administrator to assign.

If the message remains, confirm the folder paths and check the container log.
A signed-out request to `/api/hearth/snapshot` should return an authentication
error instead of 404 once the hooks have loaded.

## Verification

`npm run test:pb:legacy` exercises migration preservation and repeat application,
member isolation, invitations, transaction rollback, duplicate retries, stale
snapshots, and settings ownership against an isolated PocketBase 0.19.2 instance.
Set `HEARTH_PB_BIN` to the executable; no live server is contacted.

The image's [historical Dockerfile](https://github.com/SPECTADO/pocketbase-docker/blob/bb6972ddc722eaf08dc866887cac878d20f99c8e/Dockerfile)
sets `/pb_data`. PocketBase 0.19.2's [hook defaults](https://github.com/pocketbase/pocketbase/blob/v0.19.2/plugins/jsvm/jsvm.go)
resolve the sibling directories `/pb_hooks` and `/pb_migrations`.

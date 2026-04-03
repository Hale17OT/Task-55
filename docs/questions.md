# StudioOps Technical Requirement Analysis: Gaps & Clarifications

This document identifies the critical system-affecting ambiguities found in the StudioOps Offline Platform specification. These must be resolved to ensure the Angular-Fastify-Postgres architecture maintains data integrity and local network stability.

---

### 1. Asset Storage and Path Resolution
* **What sounded ambiguous:** The prompt mentions uploading photo/video assets but doesn't define the relationship between the Fastify server and physical storage.
* **How it was understood:** Assets are stored on a local filesystem/NAS, and PostgreSQL stores only the metadata and relative file paths.
* **How it was solved:** Does the system require a specific directory structure for hot/cold storage? Should the API serve these files via a static stream or a protected buffer for authorization?

### 2. Canary Rollout Logic in a Local Network
* **What sounded ambiguous:** A "canary rollout to 10% of targeted users" for versioned rules.
* **How it was understood:** Usually handled by cloud load balancers, this must be handled at the application level in an offline environment.
* **How it was solved:** Implementation of a deterministic hash-based "bucket" system on User IDs to assign canary status without external infrastructure.

### 3. Rule Penalty Persistence
* **What sounded ambiguous:** "Escalating penalties" (30-minute disablement after 3 violations).
* **How it was understood:** This is a state-driven lock.
* **How it was solved:** Penalties must be persisted in a `user_restrictions` table in PostgreSQL to prevent users from bypassing penalties by restarting their browser or clearing local storage.

### 4. Sliding Session Management
* **What sounded ambiguous:** "30-minute access lifetime and 8-hour sliding session limit."
* **How it was understood:** This implies a Refresh Token strategy managed entirely by Fastify.
* **How it was solved:** A `refresh_tokens` table is required to track the 8-hour limit and allow Admins to revoke sessions locally, as there is no central identity provider.

### 5. Deduplication Similarity Thresholds
* **What sounded ambiguous:** "Deduplicate near-identical listings using multi-feature similarity."
* **How it was understood:** A background logic task flags items for Operations approval.
* **How it was solved:** What is the "Similarity Score" threshold (e.g., 85% match)? Is the check synchronous (blocking the upload) or asynchronous (flagging it post-upload)?

### 6. Local Folder Export Permissions
* **What sounded ambiguous:** "Exports must produce... files saved to a user-selected local folder."
* **How it was understood:** The Angular app needs to write directly to the local disk.
* **How it was solved:** Since browser sandboxing prevents arbitrary file writing, will the app use the `File System Access API` (modern) or default to a standard `Downloads` stream?

### 7. Provenance Preservation in Merges
* **What sounded ambiguous:** "Merge workflows that preserve provenance."
* **How it was understood:** If two listings merge, we must track the original creators.
* **How it was solved:** Does the "Master Record" retain foreign keys to deleted/hidden records, or is a JSONB history column used to store the lineage of the data?

### 8. Service Visibility vs. RBAC Priority
* **What sounded ambiguous:** Visibility is defined as "public, private, or restricted," alongside a Role-Based system.
* **How it was understood:** Visibility acts as a secondary filter on top of RBAC.
* **How it was solved:** If a service is "Restricted to Client A," can an Operations user still see it for analytics? (Logic: Ops/Admin roles should bypass visibility filters).

### 9. Compression Pipeline Location
* **What sounded ambiguous:** "Immediate in-app feedback on... automatic local compression targets."
* **How it was understood:** Users need progress bars for the downscaling process.
* **How it was solved:** Is compression client-side (Angular/Web Workers) to save server CPU, or server-side (Fastify/FFmpeg) for quality control?

### 10. Audit Log Immutability
* **What sounded ambiguous:** "Immutable access audit logs."
* **How it was understood:** Logs cannot be modified or deleted once written.
* **How it was solved:** PostgreSQL `INSTEAD OF UPDATE OR DELETE` triggers must be implemented to prevent any role (including Admins) from tampering with the logs for 365 days.

### 11. Guest Rate Limiting Identification
* **What sounded ambiguous:** "30/minute for Guests."
* **How it was understood:** Guests are unauthenticated and share the same local network.
* **How it was solved:** Should rate-limiting be strictly per-IP, or should the system use browser fingerprinting to distinguish between multiple guests on the same workstation?

### 12. Organizational Hierarchy Boundaries
* **What sounded ambiguous:** "Operations can view analytics across assigned orgs."
* **How it was understood:** The system is multi-tenant but local.
* **How it was solved:** Can a user belong to multiple Organizations simultaneously? If a Merchant moves to a new Org, does their portfolio history stay with the old Org?

### 13. Physical vs. Digital Dimension Normalization
* **What sounded ambiguous:** "Normalizes... dimensions to inches."
* **How it was understood:** This refers to physical print sizes (e.g., 8x10 portrait).
* **How it was solved:** How does the system handle "A4" or "cm" inputs? Furthermore, if the user enters digital resolutions (pixels), is there a standard DPI (e.g., 300) used for the conversion?

### 14. Priority Bypass Conflict
* **What sounded ambiguous:** "Priority bypass for whitelisted users" vs "Rate limiting."
* **How it was understood:** Whitelisted users (likely Admins) should never receive a `429 Too Many Requests` error.
* **How it was solved:** Does the "Whitelisted" status also exempt the user from the "Escalating Penalties" (30-minute lockout) logic in the Rules Engine?
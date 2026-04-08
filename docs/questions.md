Nice work on the StudioOps breakdown, Hale. The move to an Angular-Fastify-Postgres stack for an offline environment brings some unique challenges—especially with that browser sandboxing and the lack of a cloud-based identity provider.

Here is the refactored list using the requested format:

(1) Asset Storage and Path Resolution

Question: How will the Fastify server interface with physical storage, and how should it serve these files to the frontend?

My Understanding: PostgreSQL stores metadata and relative paths, while the actual photo/video assets live on a local filesystem or NAS.

Solution: Define a standardized directory structure for hot and cold storage and implement Fastify routes that serve files via a protected buffer to ensure authorization checks are applied before delivery.

(2) Canary Rollout Logic

Question: How can we implement a 10% canary rollout for versioned rules in a purely local, offline network?

My Understanding: Infrastructure-level rollouts (like AWS/GCP load balancers) aren't available, so this logic must exist at the application level.

Solution: Implement a Deterministic Hash-Based "Bucket" System using User IDs; this allows the application to assign canary status consistently across sessions without needing external infrastructure.

(3) Rule Penalty Persistence

Question: How do we ensure that "escalating penalties" (30-minute lockouts) are not bypassed by a simple browser refresh?

My Understanding: This is a state-driven security lock rather than just a UI-level restriction.

Solution: Persist all lockouts in a dedicated user_restrictions table in PostgreSQL. The backend will check this table on every request, ensuring the penalty persists regardless of browser state or local storage clears.

(4) Sliding Session Management

Question: How will the 30-minute lifetime and 8-hour sliding limit be managed without a central identity provider (IdP)?

My Understanding: Fastify must handle the entire Refresh Token lifecycle and session tracking locally.

Solution: Implement a refresh_tokens table in the database to track the 8-hour maximum session age and provide an Admin interface to revoke specific tokens/sessions locally.

(5) Deduplication Similarity Thresholds

Question: What specific similarity score constitutes a "near-identical" listing, and is the check performed in real-time?

My Understanding: This logic identifies duplicates for manual approval by the Operations team.

Solution: Establish an 85% Similarity Score threshold. To ensure a smooth user experience, the check will be Asynchronous, flagging the listing for review immediately after upload rather than blocking the user during the process.

(6) Local Folder Export Permissions

Question: How will the Angular app write files to a user-selected folder given standard browser security sandboxing?

My Understanding: The app needs to bypass the typical "Downloads" flow to save files to a specific local directory.

Solution: Utilize the modern File System Access API to allow users to grant the app permission to a specific directory, falling back to a standard stream-to-download approach for older browsers.

(7) Provenance Preservation in Merges

Question: When merging two listings, how do we maintain the lineage and creator history of the original records?

My Understanding: The "Master Record" must contain the provenance of all merged data points.

Solution: Use a JSONB history column within the master record to store the full lineage and original metadata, or retain foreign keys to the original records marked as hidden_merged.

(8) Service Visibility vs. RBAC Priority

Question: Does a "Private" or "Restricted" visibility status prevent high-level Operations users from seeing data for analytics?

My Understanding: Visibility is a secondary filter that layers on top of standard Role-Based Access Control.

Solution: Implement logic where Operations and Admin roles bypass visibility filters; this ensures they have full system visibility while standard users are restricted by the specific visibility flags.

(9) Compression Pipeline Location

Question: Should asset compression be handled in the client's browser or on the Fastify server?

My Understanding: Users need immediate feedback and progress bars during the compression/downscaling process.

Solution: Perform compression Client-Side (Angular/Web Workers) using a library like browser-image-compression. This preserves server CPU and provides instant feedback, with a server-side "Quality Gate" check upon receipt.

(10) Audit Log Immutability

Question: How can we guarantee that audit logs remain immutable for 365 days in an environment where an admin has DB access?

My Understanding: Logs must be protected from any modification or deletion to maintain audit integrity.

Solution: Implement PostgreSQL INSTEAD OF UPDATE OR DELETE triggers on the audit table. These triggers will block any modification attempts and log the attempt itself as a high-priority security event.

(11) Guest Rate Limiting Identification

Question: How do we differentiate between multiple unauthenticated guests sharing the same local network IP?

My Understanding: We need to apply a 30-request-per-minute limit without blocking the entire station.

Solution: Use a combination of IP-based limiting and Browser Fingerprinting. This allows the system to distinguish between different guest sessions even if they originate from the same workstation or NAT.

(12) Organizational Hierarchy Boundaries

Question: What happens to portfolio data and history when a Merchant moves from one Organization to another?

My Understanding: The system is multi-tenant and tracks data across different organizational boundaries.

Solution: Portfolio history remains hard-linked to the original Organization where it was created. If a Merchant moves, they start with a fresh portfolio in the new Org, while their historical data remains archived under the previous Org.

(13) Physical vs. Digital Dimension Normalization

Question: How does the system handle conversions between various units (cm, A4) and digital pixels into a standard inch format?

My Understanding: All physical print sizes must be normalized to inches (e.g., 8x10).

Solution: Build a conversion utility that handles metric and standard paper sizes, using a fixed 300 DPI (Dots Per Inch) standard for converting digital pixel resolutions into physical dimensions.

(14) Priority Bypass Conflict

Question: Does "Whitelisted" status exempt a user from both rate limiting and the 30-minute "Escalating Penalty" lockouts?

My Understanding: Whitelisted users (Admins/Operations) should never be blocked from critical system tasks.

Solution: Whitelisted status provides a Full Exemption from rate limiting and the lockout logic of the Rules Engine, ensuring administrative access is never accidentally restricted by security automation.
import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { changeAccess, listAccounts } from "../services/accountAccess.js";
import { deleteOrganizationAccount } from "../services/accountDeletion.js";
import {
  listQuery,
  deleteAccountBody,
  approveBody,
  rejectBody,
  suspendBody,
  reactivateBody,
  extendBody,
} from "../validators/superAdmin.js";

const router = Router();

// Every route below is Super Admin only. Owners get 403, logged-out callers 401.
router.use(requireAuth, requireSuperAdmin);

router.get("/accounts", validate({ query: listQuery }), async (req, res) => {
  const { status, q, expiring, page, limit } = req.query;
  res.json(
    await listAccounts({
      status: status ?? "all",
      q: q ?? "",
      expiring: expiring === "true",
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    })
  );
});

const ACTION_VALIDATORS = {
  approve: approveBody,
  reject: rejectBody,
  suspend: suspendBody,
  reactivate: reactivateBody,
  extend: extendBody,
};

// Permanent deletion; see services/accountDeletion.js.
router.post("/accounts/:id/delete", validate({ body: deleteAccountBody }), async (req, res) => {
  const result = await deleteOrganizationAccount({
    organizationId: req.params.id,
    confirmName: req.body.confirmName,
    actor: req.user,
  });
  res.json({ deleted: result });
});

for (const [action, validator] of Object.entries(ACTION_VALIDATORS)) {
  router.post(`/accounts/:id/${action}`, validate({ body: validator }), async (req, res) => {
    const account = await changeAccess({
      organizationId: req.params.id,
      action,
      body: req.body ?? {},
      actor: req.user,
    });
    res.json({ account });
  });
}

export default router;

import mongoose from "mongoose";

export const ROLES = ["owner", "superadmin"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // Excluded from queries by default; ask for it explicitly with .select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "owner" },
    // Owners belong to exactly one organization; the Super Admin belongs to none.
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
      required: function () {
        return this.role === "owner";
      },
    },
    lastLoginAt: { type: Date, default: null },
    // Sessions issued before this moment are refused (see requireAuth), so a
    // password reset logs out every existing session.
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  updateProfile,
  changePassword,
  signOut,
} from "@/lib/actions/user.actions";
import { Loader2, LogOut, Save, Key } from "lucide-react";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  address1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required").max(2),
  postalCode: z.string().min(5, "Valid postal code required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const ProfileForm = ({ user }: { user: User }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      address1: user.address1 ?? "",
      city: user.city ?? "",
      state: user.state ?? "",
      postalCode: user.postalCode ?? "",
      dateOfBirth: user.dateOfBirth ?? "",
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSaveProfile = async (data: z.infer<typeof profileSchema>) => {
    setIsSaving(true);
    setMessage(null);

    const result = await updateProfile(data);
    if (result.success) {
      setMessage({ type: "success", text: "Profile updated successfully!" });
    } else if ("error" in result) {
      setMessage({
        type: "error",
        text: result.error ?? "Failed to update profile.",
      });
    }

    setIsSaving(false);
  };

  const onChangePassword = async (data: z.infer<typeof passwordSchema>) => {
    setIsChangingPassword(true);
    setMessage(null);

    const result = await changePassword(data.currentPassword, data.newPassword);
    if (result.success) {
      setMessage({ type: "success", text: "Password changed successfully!" });
      passwordForm.reset();
      setShowPasswordForm(false);
    } else if ("error" in result) {
      setMessage({
        type: "error",
        text: result.error ?? "Failed to change password.",
      });
    }

    setIsChangingPassword(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="space-y-8">
      {message && (
        <div
          className={`rounded-md p-3 text-sm border ${
            message.type === "success"
              ? "bg-green-50 text-green-600 border-green-200"
              : "bg-red-50 text-red-600 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Profile Form */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-20 font-semibold text-gray-900 mb-6">
          Personal Information
        </h2>
        <Form {...profileForm}>
          <form
            onSubmit={profileForm.handleSubmit(onSaveProfile)}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={profileForm.control}
                name="firstName"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">First Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="input-class" />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <FormField
                control={profileForm.control}
                name="lastName"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="input-class" />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
            </div>

            <FormField
              control={profileForm.control}
              name="email"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled
                      className="input-class bg-gray-50"
                    />
                  </FormControl>
                  <FormMessage className="mt-1 form-message" />
                </div>
              )}
            />

            <FormField
              control={profileForm.control}
              name="address1"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Address</FormLabel>
                  <FormControl>
                    <Input {...field} className="input-class" />
                  </FormControl>
                  <FormMessage className="mt-1 form-message" />
                </div>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={profileForm.control}
                name="city"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">City</FormLabel>
                    <FormControl>
                      <Input {...field} className="input-class" />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <FormField
                control={profileForm.control}
                name="state"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">State</FormLabel>
                    <FormControl>
                      <Input {...field} className="input-class" maxLength={2} />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <FormField
                control={profileForm.control}
                name="postalCode"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">Postal Code</FormLabel>
                    <FormControl>
                      <Input {...field} className="input-class" />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
            </div>

            <FormField
              control={profileForm.control}
              name="dateOfBirth"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Date of Birth</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" className="input-class" />
                  </FormControl>
                  <FormMessage className="mt-1 form-message" />
                </div>
              )}
            />

            <Button
              type="submit"
              disabled={isSaving}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Save Changes
            </Button>
          </form>
        </Form>
      </div>

      {/* Password Change */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-20 font-semibold text-gray-900">Password</h2>
          <Button
            variant="outline"
            onClick={() => setShowPasswordForm(!showPasswordForm)}
          >
            <Key size={16} className="mr-2" />
            {showPasswordForm ? "Cancel" : "Change Password"}
          </Button>
        </div>

        {showPasswordForm && (
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onChangePassword)}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">
                      Current Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        className="input-class"
                      />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">New Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        className="input-class"
                      />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">
                      Confirm New Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        className="input-class"
                      />
                    </FormControl>
                    <FormMessage className="mt-1 form-message" />
                  </div>
                )}
              />
              <Button
                type="submit"
                disabled={isChangingPassword}
                className="bg-bankGradient"
              >
                {isChangingPassword ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : null}
                Update Password
              </Button>
            </form>
          </Form>
        )}
      </div>

      {/* Sign Out */}
      <div className="rounded-xl border border-red-200 p-6">
        <h2 className="text-20 font-semibold text-red-600 mb-2">Danger Zone</h2>
        <p className="text-14 text-gray-600 mb-4">
          Sign out of your account. You will need to sign in again to access
          your dashboard.
        </p>
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          <LogOut size={16} className="mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default ProfileForm;

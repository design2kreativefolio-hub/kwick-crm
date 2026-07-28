from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmployeeSetPasswordTokenGenerator(PasswordResetTokenGenerator):
    """
    Same mechanism as Django's password-reset token: the hash incorporates the
    user's current password + pk + timestamp, so it self-invalidates the moment
    the employee sets their password (or if a manager re-approves later).
    """

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.password}{user.status}{timestamp}"


employee_set_password_token = EmployeeSetPasswordTokenGenerator()

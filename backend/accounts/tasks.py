from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
import logging

logger = logging.getLogger(__name__)


def dispatch_email_task(task, *args, **kwargs):
    """Queue on Celery; if the broker is down, send inline so approvals still mail."""
    try:
        return task.delay(*args, **kwargs)
    except Exception:
        logger.exception("Celery queue failed for %s — sending synchronously", task.name)
        return task(*args, **kwargs)


def _send_user_email(*, subject: str, message: str, recipient: str) -> None:
    """Send mail and log failures — approval mail runs on Celery, so silent
    SMTP errors previously looked like 'email never sent' on localhost."""
    try:
        sent = send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
        if not sent:
            logger.error("Email to %s returned 0: %s", recipient, subject)
        else:
            logger.info("Email sent to %s: %s", recipient, subject)
    except Exception:
        logger.exception("Failed sending email to %s: %s", recipient, subject)
        raise


@shared_task
def send_approval_email(user_id: int):
    """
    Notify a user their account was approved (email only, no push — spec §4).
    Self-registered employees already have a password. Employees added
    directly via HR (no invite code) start with no usable password, so this
    email also carries a one-time link to set one.
    """
    from .models import User
    from .tokens import employee_set_password_token

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    if user.has_usable_password():
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            "Your account has been approved by a manager. You can now log in.\n\n"
            "— Kwick"
        )
    else:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = employee_set_password_token.make_token(user)
        link = f"{settings.FRONTEND_URL}/set-password?uid={uid}&token={token}"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            "Your account has been approved by a manager. Set your password to finish "
            f"setting up your account:\n\n{link}\n\n"
            "— Kwick"
        )

    _send_user_email(
        subject="Your Kwick account has been approved",
        message=body,
        recipient=user.email,
    )


@shared_task
def send_welcome_email(user_id: int):
    """A manager added this employee directly and set their password — they're
    active immediately, no approval step needed."""
    from .models import User

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    body = (
        f"Hi {user.full_name or user.email},\n\n"
        "A manager has created your Kwick account and it's ready to use. "
        f"Log in at {settings.FRONTEND_URL}/login with your email and the password "
        "your manager shared with you.\n\n"
        "— Kwick"
    )
    _send_user_email(
        subject="Your Kwick account is ready",
        message=body,
        recipient=user.email,
    )


@shared_task
def send_password_reset_email(user_id: int):
    """A manager reset this employee's password — same one-time set-password
    link mechanism as the no-password-yet branch of send_approval_email."""
    from .models import User
    from .tokens import employee_set_password_token

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = employee_set_password_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/set-password?uid={uid}&token={token}"
    body = (
        f"Hi {user.full_name or user.email},\n\n"
        "A manager has reset your Kwick password. Set a new one here:\n\n"
        f"{link}\n\n"
        "If you didn't expect this, contact your manager.\n\n"
        "— Kwick"
    )
    _send_user_email(
        subject="Your Kwick password was reset",
        message=body,
        recipient=user.email,
    )


@shared_task
def send_forgot_password_email(user_id: int):
    """Self-service 'forgot password' request from the login page — same
    one-time set-password link mechanism, just triggered by the user
    themselves rather than a manager. The old password stays valid until
    they actually complete this link."""
    from .models import User
    from .tokens import employee_set_password_token

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = employee_set_password_token.make_token(user)
    link = f"{settings.FRONTEND_URL}/set-password?uid={uid}&token={token}"
    body = (
        f"Hi {user.full_name or user.email},\n\n"
        "We received a request to reset your Kwick password. Set a new one here:\n\n"
        f"{link}\n\n"
        "If you didn't request this, you can safely ignore this email — your "
        "password won't change.\n\n"
        "— Kwick"
    )
    _send_user_email(
        subject="Reset your Kwick password",
        message=body,
        recipient=user.email,
    )


@shared_task
def send_status_change_email(user_id: int, new_status: str):
    """A manager enabled or disabled this employee's account access."""
    from .models import User

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    if new_status == "active":
        subject = "Your Kwick account has been re-enabled"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            "A manager has re-enabled your Kwick account. You can log in again.\n\n"
            "— Kwick"
        )
    else:
        subject = "Your Kwick account has been disabled"
        body = (
            f"Hi {user.full_name or user.email},\n\n"
            "A manager has disabled your Kwick account. You won't be able to log in "
            "until it's re-enabled. Contact your manager with any questions.\n\n"
            "— Kwick"
        )
    _send_user_email(subject=subject, message=body, recipient=user.email)

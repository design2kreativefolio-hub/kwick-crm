from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


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

    send_mail(
        subject="Your Kwick account has been approved",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )

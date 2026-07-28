from rest_framework import serializers

from .models import Renewal


class RenewalSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True, default="")
    staff_name = serializers.CharField(source="staff.full_name", read_only=True, default="")

    class Meta:
        model = Renewal
        fields = [
            "id",
            "subject_type",
            "client",
            "client_name",
            "staff",
            "staff_name",
            "renewal_type",
            "due_date",
            "notes",
            "status",
            "created_at",
        ]

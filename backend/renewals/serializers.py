from rest_framework import serializers

from .models import Renewal


class RenewalSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True, default="")
    staff_name = serializers.CharField(source="staff.full_name", read_only=True, default="")
    subject_label = serializers.SerializerMethodField()
    type_label = serializers.SerializerMethodField()

    class Meta:
        model = Renewal
        fields = [
            "id",
            "subject_type",
            "client",
            "client_name",
            "staff",
            "staff_name",
            "subject_name",
            "subject_label",
            "renewal_type",
            "renewal_type_detail",
            "type_label",
            "due_date",
            "registered_date",
            "is_recurring",
            "security_qa",
            "notes",
            "status",
            "created_at",
        ]

    def get_subject_label(self, obj):
        return obj.display_subject()

    def get_type_label(self, obj):
        return obj.display_type()

    def validate_security_qa(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of question/answer pairs.")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                continue
            question = str(item.get("question") or "").strip()
            answer = str(item.get("answer") or "").strip()
            if question or answer:
                cleaned.append({"question": question, "answer": answer})
        return cleaned

    def validate(self, attrs):
        subject_type = attrs.get("subject_type", getattr(self.instance, "subject_type", None))
        renewal_type = attrs.get("renewal_type", getattr(self.instance, "renewal_type", None))
        client = attrs.get("client", getattr(self.instance, "client", None) if self.instance else None)
        staff = attrs.get("staff", getattr(self.instance, "staff", None) if self.instance else None)
        subject_name = (attrs.get("subject_name") if "subject_name" in attrs else getattr(self.instance, "subject_name", "")) or ""
        type_detail = (
            attrs.get("renewal_type_detail")
            if "renewal_type_detail" in attrs
            else getattr(self.instance, "renewal_type_detail", "")
        ) or ""

        if subject_type == Renewal.SubjectType.CLIENT:
            if not client:
                raise serializers.ValidationError({"client": "Select a client."})
            attrs["staff"] = None
            attrs["subject_name"] = ""
        elif subject_type == Renewal.SubjectType.STAFF:
            if not staff:
                raise serializers.ValidationError({"staff": "Select a staff member."})
            attrs["client"] = None
            attrs["subject_name"] = ""
        elif subject_type == Renewal.SubjectType.OTHER:
            if not subject_name.strip():
                raise serializers.ValidationError({"subject_name": "Enter a name for this renewal."})
            attrs["client"] = None
            attrs["staff"] = None
            attrs["subject_name"] = subject_name.strip()

        if renewal_type == Renewal.RenewalType.OTHER:
            if not str(type_detail).strip():
                raise serializers.ValidationError(
                    {"renewal_type_detail": "Describe the renewal type."}
                )
            attrs["renewal_type_detail"] = str(type_detail).strip()
        else:
            attrs["renewal_type_detail"] = ""

        return attrs

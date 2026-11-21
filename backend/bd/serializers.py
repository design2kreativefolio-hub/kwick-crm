from rest_framework import serializers

from sales.models import Client

from django.conf import settings

from .models import Activity, Deal, FollowUp, Lead, LeadCaptureSource, to_aed


def _name(user):
    return (user.full_name or user.email) if user else ""


class DealSummarySerializer(serializers.ModelSerializer):
    value_aed = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_code = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = [
            "id",
            "title",
            "stage",
            "value",
            "currency",
            "value_aed",
            "expected_close_date",
            "probability",
            "lost_reason",
            "lost_note",
            "proposal",
            "estimate",
            "client",
            "client_name",
            "client_code",
            "invoice",
            "stage_changed_at",
            "won_at",
            "lost_at",
        ]

    def get_client_name(self, obj):
        return obj.client.name if obj.client_id else ""

    def get_client_code(self, obj):
        return obj.client.client_id if obj.client_id else ""

    def get_value_aed(self, obj):
        return str(to_aed(obj.value, obj.currency))


class LeadSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)
    deal = serializers.SerializerMethodField()
    score_label = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            "id",
            "owner",
            "owner_name",
            "display_name",
            "company",
            "contact_name",
            "designation",
            "phone",
            "whatsapp",
            "email",
            "website",
            "country",
            "city",
            "source",
            "source_detail",
            "services",
            "est_value",
            "currency",
            "status",
            "disqualify_reason",
            "next_follow_up_at",
            "first_contacted_at",
            "last_activity_at",
            "score",
            "score_label",
            "score_reasons",
            "deal",
            "created_at",
            "updated_at",
        ]
        # Status only moves through the dedicated actions (qualify / disqualify /
        # move / win) so every change is validated and lands on the timeline.
        # Owner only changes through the superadmin's reassign action.
        read_only_fields = [
            "owner",
            "status",
            "disqualify_reason",
            "next_follow_up_at",
            "first_contacted_at",
            "last_activity_at",
            "score",
            "score_reasons",
        ]

    def get_score_label(self, obj):
        from .scoring import label

        return label(obj.score, obj.status)

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def get_deal(self, obj):
        deal = getattr(obj, "deal", None)
        return DealSummarySerializer(deal).data if deal is not None else None

    def validate_services(self, value):
        valid = {s.value for s in Client.Service}
        if not isinstance(value, list):
            raise serializers.ValidationError("Services must be a list.")
        return [v for v in value if v in valid]

    def validate(self, attrs):
        merged = {**{f: getattr(self.instance, f, "") for f in ("company", "contact_name")}, **attrs}
        if not (merged.get("company") or "").strip() and not (merged.get("contact_name") or "").strip():
            raise serializers.ValidationError("Add a company or a contact name.")
        return attrs


class DealSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    lead_name = serializers.CharField(source="lead.display_name", read_only=True)
    value_aed = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_code = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = [
            "id",
            "lead",
            "lead_name",
            "owner",
            "owner_name",
            "title",
            "stage",
            "value",
            "currency",
            "value_aed",
            "expected_close_date",
            "probability",
            "lost_reason",
            "lost_note",
            "proposal",
            "estimate",
            "client",
            "client_name",
            "client_code",
            "invoice",
            "stage_changed_at",
            "won_at",
            "lost_at",
            "created_at",
            "updated_at",
        ]
        # Stage / client / lost data move only through move + win.
        read_only_fields = [
            "lead",
            "owner",
            "stage",
            "lost_reason",
            "lost_note",
            "client",
            "invoice",
            "stage_changed_at",
            "won_at",
            "lost_at",
        ]

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def get_client_name(self, obj):
        return obj.client.name if obj.client_id else ""

    def get_client_code(self, obj):
        return obj.client.client_id if obj.client_id else ""

    def get_value_aed(self, obj):
        return str(to_aed(obj.value, obj.currency))

    def _own_document(self, value):
        """A BDE may only attach proposals/estimates they built themselves."""
        from common.permissions import is_bde

        request = self.context.get("request")
        if value is not None and request is not None and is_bde(request.user):
            if value.owner_id != request.user.pk:
                raise serializers.ValidationError("Pick one of your own documents.")
        return value

    def validate_proposal(self, value):
        return self._own_document(value)

    def validate_estimate(self, value):
        return self._own_document(value)

    def validate_probability(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError("Probability is a percentage (0–100).")
        return value


class ActivitySerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = [
            "id",
            "lead",
            "deal",
            "user",
            "user_name",
            "kind",
            "direction",
            "outcome",
            "body",
            "occurred_at",
            "meeting_url",
            "created_at",
        ]
        read_only_fields = ["lead", "deal", "user", "created_at"]

    def get_user_name(self, obj):
        return _name(obj.user)


class FollowUpSerializer(serializers.ModelSerializer):
    lead_name = serializers.CharField(source="lead.display_name", read_only=True)
    owner_name = serializers.SerializerMethodField()
    done = serializers.SerializerMethodField()

    class Meta:
        model = FollowUp
        fields = [
            "id",
            "lead",
            "lead_name",
            "deal",
            "owner",
            "owner_name",
            "kind",
            "due_at",
            "note",
            "meeting_url",
            "done",
            "done_at",
            "created_at",
        ]
        read_only_fields = ["lead", "deal", "owner", "done_at", "created_at"]

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def get_done(self, obj):
        return obj.done_at is not None


class LeadCaptureSourceSerializer(serializers.ModelSerializer):
    default_owner_name = serializers.SerializerMethodField()
    endpoint = serializers.SerializerMethodField()

    class Meta:
        model = LeadCaptureSource
        fields = [
            "id",
            "name",
            "token",
            "endpoint",
            "default_owner",
            "default_owner_name",
            "active",
            "last_received_at",
            "received_count",
            "created_at",
        ]
        read_only_fields = ["token", "last_received_at", "received_count", "created_at"]

    def get_default_owner_name(self, obj):
        return _name(obj.default_owner)

    def get_endpoint(self, obj):
        base = (settings.PUBLIC_API_URL or "").rstrip("/")
        return f"{base}/api/public/bd/capture/{obj.token}"

from rest_framework import serializers

from common.media_urls import scrub_media_tree, sign_media_tree, sign_media_url

from .models import Client, Estimate, Invoice, InvoiceLineItem, Proposal
from .proposal_content import merged_content
from .estimate_content import merged_content as merged_estimate_content


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            "id",
            "client_id",
            "name",
            "contact_email",
            "contact_phone",
            "company",
            "notes",
            "start_date",
            "poc_name",
            "services",
            "other_service",
            "website",
            "address",
            "trade_license_url",
            "vat_registration_url",
            "executives",
            "additional_fields",
            "accent_color",
            "logo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["client_id", "logo_url"]

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        for field in ("trade_license_url", "vat_registration_url"):
            if ret.get(field):
                ret[field] = scrub_media_tree(ret[field])
        if "additional_fields" in ret:
            ret["additional_fields"] = scrub_media_tree(ret["additional_fields"])
        return ret

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in ("logo_url", "trade_license_url", "vat_registration_url"):
            if data.get(field):
                data[field] = sign_media_url(data[field])
        if data.get("additional_fields"):
            data["additional_fields"] = sign_media_tree(data["additional_fields"])
        return data

    def _sync_company(self, validated_data):
        # Sales treats client name and company as the same identity field.
        name = validated_data.get("name")
        if name is not None:
            validated_data["company"] = name
        return validated_data

    def _sync_poc_from_executives(self, validated_data, instance=None):
        """First company executive → Projects POC name + number."""
        executives = validated_data.get("executives", None)
        if executives is None and instance is not None:
            executives = instance.executives
        first = next(
            (
                e
                for e in (executives or [])
                if isinstance(e, dict)
                and ((e.get("name") or "").strip() or (e.get("phone") or "").strip())
            ),
            None,
        )
        if not first:
            return validated_data
        name = (first.get("name") or "").strip()
        phone = (first.get("phone") or "").strip()
        if name:
            validated_data["poc_name"] = name
        if phone:
            validated_data["contact_phone"] = phone
        return validated_data

    def create(self, validated_data):
        from sales.services import generate_client_id

        validated_data = self._sync_company(validated_data)
        validated_data = self._sync_poc_from_executives(validated_data)
        if not (validated_data.get("client_id") or "").strip():
            validated_data["client_id"] = generate_client_id()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._sync_company(validated_data)
        validated_data = self._sync_poc_from_executives(validated_data, instance)
        return super().update(instance, validated_data)


class ProposalSerializer(serializers.ModelSerializer):
    # Display name for list rows: the linked CRM client if there is one,
    # otherwise whatever name was typed into the cover (content.home
    # .client_name) for a one-off client that isn't in the CRM.
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = [
            "id",
            "client",
            "client_name",
            "title",
            "status",
            "content",
            "created_at",
            "updated_at",
        ]

    def get_client_name(self, obj):
        if obj.client_id:
            return obj.client.name
        home = (obj.content or {}).get("home")
        if isinstance(home, dict):
            return home.get("client_name", "") or ""
        return ""

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "content" in ret:
            ret["content"] = scrub_media_tree(ret["content"])
        return ret

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("content"):
            data["content"] = sign_media_tree(data["content"])
        return data

    def _synced_title(self, content, fallback):
        home = (content or {}).get("home") if isinstance(content, dict) else None
        if not isinstance(home, dict):
            return fallback
        title = (home.get("title") or "").strip()
        return title or fallback

    def create(self, validated_data):
        # Always store a fully-shaped content object (defaults filled in),
        # regardless of what the client posted — every section key is then
        # guaranteed present for the builder/preview/exports to read.
        content = merged_content(validated_data.get("content") or {})
        validated_data["content"] = content
        # CRM/list/PDF-filename title is independent of the cover heading
        # (content.home.title). Default from cover only when none is supplied.
        supplied = (validated_data.get("title") or "").strip()
        validated_data["title"] = supplied or self._synced_title(content, "Untitled Proposal")
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "content" in validated_data:
            validated_data["content"] = merged_content(validated_data["content"])
        if "title" in validated_data:
            title = (validated_data.get("title") or "").strip()
            validated_data["title"] = title or instance.title or "Untitled Proposal"
        return super().update(instance, validated_data)


class EstimateSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Estimate
        fields = [
            "id",
            "client",
            "client_name",
            "title",
            "status",
            "content",
            "created_at",
            "updated_at",
        ]

    def get_client_name(self, obj):
        if obj.client_id:
            return obj.client.name
        return (obj.content or {}).get("bill_to", "")

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "content" in ret:
            ret["content"] = scrub_media_tree(ret["content"])
        return ret

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("content"):
            data["content"] = sign_media_tree(data["content"])
        return data

    def _synced_title(self, content, fallback):
        quote = (content or {}).get("quote_number", "").strip()
        bill_to = (content or {}).get("bill_to", "").strip()
        if quote and bill_to:
            return f"{quote} — {bill_to}"
        return quote or bill_to or fallback

    def create(self, validated_data):
        content = merged_estimate_content(validated_data.get("content"))
        validated_data["content"] = content
        # List/PDF filename title is independent of quote_number; default from quote only when none supplied.
        supplied = (validated_data.get("title") or "").strip()
        validated_data["title"] = supplied or self._synced_title(content, "Untitled Estimate")
        client_id = content.get("client_id")
        if client_id and not validated_data.get("client"):
            validated_data["client_id"] = client_id
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "content" in validated_data:
            content = merged_estimate_content(validated_data["content"])
            validated_data["content"] = content
            if "client" not in validated_data:
                validated_data["client_id"] = content.get("client_id") or None
        if "title" in validated_data:
            title = (validated_data.get("title") or "").strip()
            validated_data["title"] = title or instance.title or "Untitled Estimate"
        return super().update(instance, validated_data)


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = InvoiceLineItem
        fields = ["id", "description", "quantity", "unit_price", "line_total"]


class InvoiceSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    line_items = InvoiceLineItemSerializer(many=True, required=False)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "client",
            "client_name",
            "proposal",
            "title",
            "invoice_number",
            "amount",
            "status",
            "due_date",
            "content",
            "line_items",
            "created_at",
            "updated_at",
        ]

    def get_client_name(self, obj):
        if obj.client_id:
            return obj.client.name
        return (obj.content or {}).get("bill_to", "")

    def get_title(self, obj):
        content_title = ((obj.content or {}).get("title") or "").strip()
        if content_title:
            return content_title
        return obj.invoice_number or f"Invoice #{obj.pk}"

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "content" in ret:
            ret["content"] = scrub_media_tree(ret["content"])
        return ret

    def to_representation(self, instance):
        """Hydrate builder `content.items` from legacy InvoiceLineItem rows when
        content was never migrated (migration 0008 left content empty)."""
        data = super().to_representation(instance)
        content = data.get("content") or {}
        items = content.get("items") or []
        has_real_items = any(
            (it.get("description") or "").strip() or float(it.get("rate") or 0)
            for it in items
        )
        if not has_real_items and getattr(instance, "line_items", None) is not None:
            legacy = list(instance.line_items.all())
            if legacy:
                content = {**content}
                content["items"] = [
                    {
                        "description": row.description or "",
                        "details": "",
                        "qty": float(row.quantity),
                        "rate": float(row.unit_price),
                    }
                    for row in legacy
                ]
                if not (content.get("invoice_number") or "").strip():
                    content["invoice_number"] = instance.invoice_number or ""
                data["content"] = content
        if data.get("content"):
            data["content"] = sign_media_tree(data["content"])
        return data

    def _apply_content(self, validated_data):
        from decimal import Decimal

        from .invoice_content import merged_content, subtotal
        from .invoice_pdf import ensure_invoice_number

        content = merged_content(validated_data.get("content"))
        validated_data["content"] = content
        validated_data["invoice_number"] = ensure_invoice_number(
            content.get("invoice_number") or validated_data.get("invoice_number") or ""
        )
        content["invoice_number"] = validated_data["invoice_number"]
        if not (content.get("title") or "").strip():
            content["title"] = "Invoice"
        validated_data["content"] = content
        validated_data["amount"] = Decimal(str(subtotal(content.get("items") or [])))
        due = content.get("due_date") or None
        validated_data["due_date"] = due or None
        client_id = content.get("client_id")
        if client_id and not validated_data.get("client"):
            validated_data["client_id"] = client_id
        return validated_data

    def create(self, validated_data):
        validated_data.pop("line_items", None)
        validated_data = self._apply_content(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("line_items", None)
        if "content" in validated_data:
            validated_data = self._apply_content(validated_data)
            if "client" not in validated_data:
                validated_data["client_id"] = (validated_data["content"] or {}).get("client_id") or None
        return super().update(instance, validated_data)
from rest_framework import serializers

from .models import Client, Invoice, InvoiceLineItem, Proposal
from .proposal_content import merged_content


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "contact_email",
            "contact_phone",
            "company",
            "notes",
            "services",
            "created_at",
        ]


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
        return (obj.content or {}).get("home", {}).get("client_name", "")

    def _synced_title(self, content, fallback):
        title = (content or {}).get("home", {}).get("title", "").strip()
        return title or fallback

    def create(self, validated_data):
        # Always store a fully-shaped content object (defaults filled in),
        # regardless of what the client posted — every section key is then
        # guaranteed present for the builder/preview/exports to read.
        content = merged_content(validated_data.get("content"))
        validated_data["content"] = content
        validated_data["title"] = self._synced_title(content, validated_data.get("title") or "Untitled Proposal")
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "content" in validated_data:
            validated_data["content"] = merged_content(validated_data["content"])
            validated_data["title"] = self._synced_title(validated_data["content"], instance.title)
        return super().update(instance, validated_data)


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = InvoiceLineItem
        fields = ["id", "description", "quantity", "unit_price", "line_total"]


class InvoiceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, required=False)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "client",
            "client_name",
            "proposal",
            "invoice_number",
            "amount",
            "status",
            "due_date",
            "line_items",
            "created_at",
        ]

    def create(self, validated):
        line_items = validated.pop("line_items", [])
        invoice = Invoice.objects.create(**validated)
        for item in line_items:
            InvoiceLineItem.objects.create(invoice=invoice, **item)
        return invoice

    def update(self, instance, validated):
        line_items = validated.pop("line_items", None)
        for attr, value in validated.items():
            setattr(instance, attr, value)
        instance.save()
        if line_items is not None:
            instance.line_items.all().delete()
            for item in line_items:
                InvoiceLineItem.objects.create(invoice=instance, **item)
        return instance

from rest_framework import serializers

from .models import Client, Invoice, InvoiceLineItem, Proposal


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
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = Proposal
        fields = [
            "id",
            "client",
            "client_name",
            "title",
            "status",
            "amount",
            "valid_until",
            "created_at",
        ]


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

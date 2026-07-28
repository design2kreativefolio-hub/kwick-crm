from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """All list endpoints paginated, default page size 25 (spec §0)."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200

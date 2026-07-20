from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Person
from .serializers import PersonSerializer


class PersonListCreateView(APIView):
    def get(self, request):
        people = Person.objects.all()
        serializer = PersonSerializer(people, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PersonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

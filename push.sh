#!/bin/sh
clear
D=$(date  +%Y-%m-%d)
T=$(date +%H:%M:%S)
echo "--------------- Starting to push..."
echo  "Time: " $T
echo " "
docker compose down
echo "--------------- remove containers ---------------"
docker rm $(docker ps -a -q)
echo "--------------- remove images ---------------"
docker image rm zanova/frontend
docker image rm zanova/backend
docker image rm zanova/sctms_v2
#docker image rm zanova/tserver_v2
#docker image rm zanova/sctbot_v2
echo "--------------- remove unused images ----------"
docker rmi $(docker images -f dangling=true -q)
echo "--------------- images ---------------"
docker image ls
#cp -f "docker-compose Build.yml" docker-compose.yml

echo "-------------------------------------------------"
echo "--------------- BUILD ---------------------------"
echo "-------------------------------------------------"
echo "--------- Clear builder cache -------------------"
docker builder prune -f

#docker compose build --force-rm --no-cache
docker compose build

echo "--------------- remove unused images ----------"
#docker rmi $(docker images -f dangling=true -q)

docker image ls
# Заливаем image в DockerHub
docker push zanova/frontend
# Заливаем image в DockerHub
docker push zanova/backend
# Заливаем image в DockerHub
docker push zanova/sctms_v2
# Заливаем image в DockerHub
#docker push zanova/tserver
# Заливаем image в DockerHub
#docker push zanova/sctbot
echo "---------------- FINISHED! ---------------------------------"

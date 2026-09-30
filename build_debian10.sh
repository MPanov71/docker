#!/bin/sh
    D=$(date  +%Y-%m-%d)
    T=$(date +%H:%M:%S)
    echo " "
    echo  "Time: " $T
    echo " "

    echo "--------------- copy Dockerfile  ------"
#    cp -f Dockerfile.debian10 ./Dockerfile

    echo "--------------- remove old image ------"
#    docker image rm compile_debian10

    echo "--------------- clear builder cache ------"
#    docker builder prune -f

    echo "--------------- building compile image ----"
#    docker build . --tag compile_debian10

    docker image ls

    echo "---------------- compiling software ------"
    docker run --rm -it -v /home/mark/work/src/:/compile -e TZ=Europe/Moscow compile_debian10 all
#    cp -f /home/mark/work/zanova/!old/sctms ./sctms
#    cp -f /home/mark/work/zanova/sctbot ./sctbot
#    cp -f /home/mark/work/zanova/tserver ./tserver
echo "---------------- FINISHED! ---------------"
import React from 'react';
import { useCamera } from '@ionic/react-hooks/camera';
import { useFilesystem, base64FromPath } from '@ionic/react-hooks/filesystem';
import { useStorage } from '@ionic/react-hooks/storage';
import { isPlatform } from '@ionic/react';
import { CameraResultType, CameraSource, CameraPhoto, Capacitor, FilesystemDirectory } from '@capacitor/core';

export interface Photo {
  filepath: string;
  webviewpath?: string;
  base64?: string;
}

const PHOTO_STORAGE = 'photos';

export function usePhotoGallery() {
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const { deleteFile, readFile, writeFile } = useFilesystem();
  const { getPhoto } = useCamera();
  const { get, set } = useStorage();

  React.useEffect(() => {
    const loadSaved = async () => {
      const photosString = await get(PHOTO_STORAGE);
      const photosInStorage = (photosString ? JSON.parse(photosString) : []) as Photo[];
      // If running on the web
      if (isPlatform('hybrid') === false) {
        for (let photo of photosInStorage) {
          const file = await readFile({
            path: photo.filepath,
            directory: FilesystemDirectory.Data
          });
          photo.base64 = `data:image/jpeg;base64,${file.data}`;
        }
      }
      setPhotos(photosInStorage);
    };
    loadSaved();
  }, [get, readFile]);

  const savePicture = async (photo: CameraPhoto, fileName: string): Promise<Photo> => {
    let base64Data: string;
    // "hybrid" will detect Cordova or Capacitor.
    if (isPlatform('hybrid')) {
      const file = await readFile({
        path: photo.path!
      });
      base64Data = file.data;
    } else {
      base64Data = await base64FromPath(photo.webPath!);
    }
    const savedFile = await writeFile({
      path: fileName,
      data: base64Data,
      directory: FilesystemDirectory.Data
    });
    if (isPlatform('hybrid')) {
      // Display the new image by rewriting the 'file://' path to HTTP
      // Details: https://ionicframework.com/docs/building/webview#file-protocol
      return {
        filepath: savedFile.uri,
        webviewpath: Capacitor.convertFileSrc(savedFile.uri)
      };
    }
    // Use webPath to display the new image instead of base64 since it's
    // already loaded into memory.
    return {
      filepath: fileName,
      webviewpath: photo.webPath
    };
  }

  const deletePhoto = async (photo: Photo) => {
    // Remove this photo from the Photos reference data array
    const newPhotos = photos.filter(p => p.filepath !== photo.filepath);
    // Update photos array cache by overwriting the existing photo array
    set(PHOTO_STORAGE, JSON.stringify(newPhotos));
    // Delete photo file from filesystem
    const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);
    await deleteFile({
      path: filename,
      directory: FilesystemDirectory.Data
    });
    setPhotos(newPhotos);
  }

  const takePhoto = async () => {
    const cameraPhoto = await getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    });
    const fileName = new Date().getTime() + '.jpeg';
    const savedFileImage = await savePicture(cameraPhoto, fileName);
    const newPhotos: Photo[] = [savedFileImage, ...photos];
    setPhotos(newPhotos);
    set(PHOTO_STORAGE, isPlatform('hybrid')
      ? JSON.stringify(newPhotos)
      : JSON.stringify(newPhotos.map(p => {
        // Don't save the base 64 representation of the photo data,
        // since it's already saved on the Filesystem.
        const photoCopy = {...p};
        delete photoCopy.base64;
        return photoCopy;
      })
    ));
  }
  return {photos, takePhoto, deletePhoto}
};